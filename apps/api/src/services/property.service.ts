import { stateName } from '@property-manager/shared';
import type { Address, StateCode } from '@property-manager/shared';
import { PropertyAlreadyExistsError, WeatherLocationMismatchError } from '../domain/errors.ts';
import type { PropertyRepository, WeatherClient } from '../domain/ports.ts';
import type { Property, PropertyListQuery, PropertyPage } from '../domain/property.ts';

export type PropertyService = {
  create(address: Address): Promise<Property>;
  getById(id: string): Promise<Property | null>;
  list(query: PropertyListQuery): Promise<PropertyPage>;
};

export type PropertyServiceDeps = { repository: PropertyRepository; weather: WeatherClient };

// The Weatherstack `query` for a normalized address (FR-05 AC2).
export function weatherQuery(address: Address): string {
  return `${address.street}, ${address.city}, ${address.state} ${address.zipCode}, United States`;
}

// Weatherstack geocodes the query itself; a region other than the input state means it placed
// the address elsewhere (FR-05 AC4). Exact match after trimming and lower-casing only.
export function regionMatchesState(region: string, state: StateCode): boolean {
  return region.trim().toLowerCase() === stateName(state).toLowerCase();
}

export function createPropertyService({
  repository,
  weather,
}: PropertyServiceDeps): PropertyService {
  return {
    // Duplicate pre-check, weather, region check, then a single insert: a failure at any step
    // stores nothing (NFR-08). A duplicate costs no weather call; a racing one is caught by the
    // unique index on insert (FR-08 AC2).
    async create(address) {
      if (await repository.existsByAddress(address)) throw new PropertyAlreadyExistsError();
      const report = await weather.current(weatherQuery(address));
      if (!regionMatchesState(report.region, address.state)) {
        throw new WeatherLocationMismatchError(address.state, report.region);
      }
      return repository.insert({
        ...address,
        lat: report.lat,
        long: report.long,
        weatherData: { units: 'IMPERIAL', current: report.current },
      });
    },

    getById(id) {
      return repository.findById(id);
    },

    // Filtering, order and paging are repository rules; no weather call (FR-01 AC6).
    list(query) {
      return repository.list(query);
    },
  };
}
