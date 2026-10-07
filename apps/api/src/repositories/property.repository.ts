import { isStateCode } from '@property-manager/shared';
import { and, eq, sql } from 'drizzle-orm';
import pg from 'pg';
import type { Database } from '../db/client.ts';
import { properties } from '../db/schema.ts';
import type { PropertyRow } from '../db/schema.ts';
import { PropertyAlreadyExistsError } from '../domain/errors.ts';
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

const ADDRESS_UNIQUE = 'properties_address_unique';

// Drizzle wraps the pg error in DrizzleQueryError (`cause`); the bare error is checked too, so a
// driver upgrade that stops wrapping still maps.
export function isAddressUniqueViolation(error: unknown): boolean {
  const pgError =
    error instanceof Error && !(error instanceof pg.DatabaseError) ? error.cause : error;
  return (
    pgError instanceof pg.DatabaseError &&
    pgError.code === '23505' &&
    pgError.constraint === ADDRESS_UNIQUE
  );
}

// Only a violation of the address index is mapped; every other DB error propagates unchanged.
export function createPropertyRepository(db: Database): PropertyRepository {
  return {
    // The same expressions as `properties_address_unique`, so the pre-check and storage agree.
    async existsByAddress({ street, city, state, zipCode }) {
      const rows = await db
        .select({ one: sql`1` })
        .from(properties)
        .where(
          and(
            sql`lower(${properties.street}) = lower(${street})`,
            sql`lower(${properties.city}) = lower(${city})`,
            eq(properties.state, state),
            eq(properties.zipCode, zipCode),
          ),
        )
        .limit(1);
      return rows.length > 0;
    },

    async insert(property) {
      const [row] = await db
        .insert(properties)
        .values(property)
        .returning()
        .catch((error: unknown) => {
          if (isAddressUniqueViolation(error))
            throw new PropertyAlreadyExistsError({ cause: error });
          throw error;
        });
      if (row === undefined) throw new Error('insert returned no row');
      return toProperty(row);
    },

    async findById(id) {
      const [row] = await db.select().from(properties).where(eq(properties.id, id)).limit(1);
      return row === undefined ? null : toProperty(row);
    },
  };
}
