import { isStateCode } from '@property-manager/shared';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.ts';
import { properties } from '../db/schema.ts';
import type { PropertyRow } from '../db/schema.ts';
import type { PropertyRepository } from '../domain/ports.ts';
import type { Property } from '../domain/property.ts';
import { toCurrentWeather } from '../domain/weather.ts';

// A row that breaks these rules was not written through the service: fail loudly.
function toProperty(row: PropertyRow): Property {
  const { state, weatherData } = row;
  if (!isStateCode(state)) throw new Error('stored property has an invalid state code');
  return {
    ...row,
    state,
    weatherData: { units: weatherData.units, current: toCurrentWeather(weatherData.current) },
  };
}

// DB errors propagate unchanged; mapping 23505 to DUPLICATE_PROPERTY is S-02.
export function createPropertyRepository(db: Database): PropertyRepository {
  return {
    async insert(property) {
      const [row] = await db.insert(properties).values(property).returning();
      if (row === undefined) throw new Error('insert returned no row');
      return toProperty(row);
    },

    async findById(id) {
      const [row] = await db.select().from(properties).where(eq(properties.id, id)).limit(1);
      return row === undefined ? null : toProperty(row);
    },
  };
}
