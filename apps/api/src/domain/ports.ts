import type { Address } from '@property-manager/shared';
import type { NewProperty, Property, PropertyListQuery, PropertyPage } from './property.ts';
import type { WeatherReport } from './weather.ts';

// Implemented by the Weatherstack adapter and by `FakeWeatherClient` in tests.
export type WeatherClient = {
  current(query: string): Promise<WeatherReport>;
};

export type PropertyRepository = {
  // True when a stored property has the same normalized address (FR-08 AC1).
  existsByAddress(address: Address): Promise<boolean>;
  // Throws `PropertyAlreadyExistsError` when the unique address index rejects the row.
  insert(property: NewProperty): Promise<Property>;
  findById(id: string): Promise<Property | null>;
  // Filtered, sorted and paged; `totalCount` counts every match (FR-01, FR-02, FR-03).
  list(query: PropertyListQuery): Promise<PropertyPage>;
  // False when no row had this id.
  deleteById(id: string): Promise<boolean>;
};
