import type { Address } from '@property-manager/shared';
import type { PropertyRepository, WeatherClient } from '../domain/ports.ts';
import type { Property } from '../domain/property.ts';

export type PropertyService = {
  create(address: Address): Promise<Property>;
  getById(id: string): Promise<Property | null>;
};

export type PropertyServiceDeps = { repository: PropertyRepository; weather: WeatherClient };

// The Weatherstack `query` for a normalized address (FR-05 AC2).
export function weatherQuery(address: Address): string {
  return `${address.street}, ${address.city}, ${address.state} ${address.zipCode}, United States`;
}

export function createPropertyService({
  repository,
  weather,
}: PropertyServiceDeps): PropertyService {
  return {
    // Weather first, then a single insert: a failure at either step stores nothing (NFR-08).
    // `region` is checked in S-02 (FR-05 AC4).
    async create(address) {
      const report = await weather.current(weatherQuery(address));
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
  };
}
