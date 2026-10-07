import type { Address } from '@property-manager/shared';
import type { PropertyRepository } from '../../src/domain/ports.ts';
import type { NewProperty, Property, PropertyPage } from '../../src/domain/property.ts';
import { toCurrentWeather } from '../../src/domain/weather.ts';

function addressKey({ street, city, state, zipCode }: Address): string {
  return JSON.stringify([street.toLowerCase(), city.toLowerCase(), state, zipCode]);
}

// The `PropertyRepository` for service tests. Maps rows the way the Drizzle repository does,
// so a `current` without its key fields fails here too.
export class InMemoryPropertyRepository implements PropertyRepository {
  readonly rows: Property[] = [];
  #insertError: Error | undefined;

  // Every later `insert` rejects with `error` and stores nothing (FR-05 AC6).
  failInsert(error: Error): void {
    this.#insertError = error;
  }

  // The same keys as `properties_address_unique`. `insert` does not enforce them: a race needs
  // `failInsert(new PropertyAlreadyExistsError())`.
  existsByAddress(address: Address): Promise<boolean> {
    return Promise.resolve(this.rows.some((row) => addressKey(row) === addressKey(address)));
  }

  insert(property: NewProperty): Promise<Property> {
    if (this.#insertError !== undefined) return Promise.reject(this.#insertError);
    const stored: Property = {
      ...structuredClone(property),
      id: crypto.randomUUID(),
      weatherData: {
        units: property.weatherData.units,
        current: toCurrentWeather(property.weatherData.current),
      },
      createdAt: new Date(),
    };
    this.rows.push(stored);
    return Promise.resolve(stored);
  }

  findById(id: string): Promise<Property | null> {
    return Promise.resolve(this.rows.find((row) => row.id === id) ?? null);
  }

  deleteById(id: string): Promise<boolean> {
    const index = this.rows.findIndex((row) => row.id === id);
    if (index !== -1) this.rows.splice(index, 1);
    return Promise.resolve(index !== -1);
  }

  // Filtering and order are proved against PostgreSQL; a second implementation here would only
  // be tested against itself.
  list(): Promise<PropertyPage> {
    return Promise.reject(new Error('list is not supported by the in-memory fake'));
  }
}
