import type { PropertyRepository } from '../../src/domain/ports.ts';
import type { NewProperty, Property } from '../../src/domain/property.ts';
import { toCurrentWeather } from '../../src/domain/weather.ts';

// The `PropertyRepository` for service tests. Maps rows the way the Drizzle repository does,
// so a `current` without its key fields fails here too.
export class InMemoryPropertyRepository implements PropertyRepository {
  readonly rows: Property[] = [];
  #insertError: Error | undefined;

  // Every later `insert` rejects with `error` and stores nothing (FR-05 AC6).
  failInsert(error: Error): void {
    this.#insertError = error;
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
}
