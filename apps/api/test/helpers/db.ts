import { count, sql } from 'drizzle-orm';
import type { Database } from '../../src/db/client.ts';
import { properties } from '../../src/db/schema.ts';
import type { NewPropertyRow, PropertyRow } from '../../src/db/schema.ts';
import { validInput } from '../fixtures/property.ts';
import { weatherstackResponse } from '../fixtures/weatherstack.ts';
import type { JsonObject } from '../fixtures/weatherstack.ts';

export async function resetDb(db: Database): Promise<void> {
  await db.execute(sql`TRUNCATE ${properties}`);
}

export async function countProperties(db: Database): Promise<number> {
  const [row] = await db.select({ n: count() }).from(properties);
  return row?.n ?? 0;
}

function objectAt(body: JsonObject, key: string): JsonObject {
  const value = body[key];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`seedProperty: sample has no "${key}" object`);
  }
  return value;
}

// A full valid row from `validInput()` and the recorded sample. Inserts through the table, not
// the repository, so seeding does not depend on the code under test. Pass `createdAt` when
// order matters.
export async function seedProperty(
  db: Database,
  overrides: Partial<NewPropertyRow> = {},
): Promise<PropertyRow> {
  const sample = weatherstackResponse();
  const location = objectAt(sample, 'location');
  const [row] = await db
    .insert(properties)
    .values({
      ...validInput(),
      lat: Number(location.lat),
      long: Number(location.lon),
      weatherData: { units: 'IMPERIAL', current: objectAt(sample, 'current') },
      ...overrides,
    })
    .returning();
  if (row === undefined) throw new Error('seedProperty: insert returned no row');
  return row;
}
