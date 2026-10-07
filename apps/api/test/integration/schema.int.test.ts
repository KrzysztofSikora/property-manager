import { eq, sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { createDb } from '../../src/db/client.ts';
import { properties } from '../../src/db/schema.ts';
import type { NewPropertyRow } from '../../src/db/schema.ts';
import { countProperties, resetDb } from '../helpers/db.ts';

const { db, close } = createDb(inject('databaseUrl'));

afterAll(close);

beforeEach(async () => {
  await resetDb(db);
});

function row(overrides: Partial<NewPropertyRow> = {}): NewPropertyRow {
  return {
    street: '15528 E Golden Eagle Blvd',
    city: 'Fountain Hills',
    state: 'AZ',
    zipCode: '85268',
    lat: 33.612,
    long: -111.717,
    weatherData: { units: 'IMPERIAL', current: { temperature: 88 } },
    ...overrides,
  };
}

// The same row in column names, for inserts that Drizzle's types would reject.
function rawRow(): Record<string, unknown> {
  return {
    street: '15528 E Golden Eagle Blvd',
    city: 'Fountain Hills',
    state: 'AZ',
    zip_code: '85268',
    lat: 33.612,
    long: -111.717,
    weather_data: { units: 'IMPERIAL', current: { temperature: 88 } },
  };
}

async function insertRaw(values: Record<string, unknown>): Promise<void> {
  const client = new pg.Client({ connectionString: inject('databaseUrl') });
  await client.connect();
  try {
    const columns = Object.keys(values);
    const params = columns.map((_, i) => `$${String(i + 1)}`);
    // Serialise jsonb values here: pg sends a JS array as a Postgres array, not as JSON.
    const args = Object.values(values).map((v) =>
      typeof v === 'object' && v !== null ? JSON.stringify(v) : v,
    );
    await client.query(
      `INSERT INTO properties (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${params.join(', ')})`,
      args,
    );
  } finally {
    await client.end();
  }
}

// Drizzle 0.45 wraps the pg error in DrizzleQueryError; the code is on `cause` (S-02).
async function dbErrorOf(promise: Promise<unknown>): Promise<pg.DatabaseError> {
  const error: unknown = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (error instanceof pg.DatabaseError) return error;
  if (error instanceof Error && error.cause instanceof pg.DatabaseError) return error.cause;
  throw new Error('expected the insert to fail with a database error');
}

describe('properties schema', () => {
  it('the migration creates the table and the address index', async () => {
    const result = await db.execute<{ indexname: string }>(
      sql`SELECT indexname FROM pg_indexes WHERE tablename = 'properties'`,
    );

    expect(result.rows.map((r) => r.indexname)).toContain('properties_address_unique');
  });

  it('FR-08 AC2, TR-06 (storage): an address differing only in case is a duplicate', async () => {
    await db.insert(properties).values(row());

    const error = await dbErrorOf(
      db
        .insert(properties)
        .values(row({ street: '15528 e golden eagle blvd', city: 'FOUNTAIN HILLS' })),
    );

    expect(error.code).toBe('23505');
    expect(error.constraint).toBe('properties_address_unique');
  });

  it('a different zip at the same street and city is not a duplicate', async () => {
    await db.insert(properties).values(row());
    await db.insert(properties).values(row({ zipCode: '85269' }));

    expect(await countProperties(db)).toBe(2);
  });

  it('FR-08 AC3 (storage): a deleted address can be inserted again', async () => {
    const [first] = await db.insert(properties).values(row()).returning();
    if (first === undefined) throw new Error('expected a row');
    await db.delete(properties).where(eq(properties.id, first.id));

    await db.insert(properties).values(row());

    expect(await countProperties(db)).toBe(1);
  });

  it.each(['street', 'city', 'state', 'zip_code', 'lat', 'long', 'weather_data'])(
    'NFR-08, TR-05 (schema): a row without %s is rejected',
    async (column) => {
      const values = Object.entries(rawRow()).filter(([key]) => key !== column);

      const error = await dbErrorOf(insertRaw(Object.fromEntries(values)));

      expect(error.code).toBe('23502');
      expect(error.column).toBe(column);
      expect(await countProperties(db)).toBe(0);
    },
  );

  it.each<[string, string, Record<string, unknown>]>([
    ['lat 90.1', 'properties_lat_range', { lat: 90.1 }],
    ['lat -90.1', 'properties_lat_range', { lat: -90.1 }],
    ['long 180.1', 'properties_long_range', { long: 180.1 }],
    ['long -180.1', 'properties_long_range', { long: -180.1 }],
    ['zip 8526', 'properties_zip_code_format', { zip_code: '8526' }],
    ['zip 852680', 'properties_zip_code_format', { zip_code: '852680' }],
    ['state az', 'properties_state_format', { state: 'az' }],
    ['state AZX', 'properties_state_format', { state: 'AZX' }],
    ['weather_data {}', 'properties_weather_data_shape', { weather_data: {} }],
    [
      'weather_data without current',
      'properties_weather_data_shape',
      { weather_data: { units: 'IMPERIAL' } },
    ],
    [
      'weather_data without units',
      'properties_weather_data_shape',
      { weather_data: { current: {} } },
    ],
    [
      'weather_data ["units","current"]',
      'properties_weather_data_shape',
      { weather_data: ['units', 'current'] },
    ],
  ])('NFR-08: %s breaks %s', async (_label, constraint, overrides) => {
    const error = await dbErrorOf(insertRaw({ ...rawRow(), ...overrides }));

    expect(error.code).toBe('23514');
    expect(error.constraint).toBe(constraint);
  });

  it.each([
    { lat: 90, long: 180 },
    { lat: -90, long: -180 },
  ])('accepts the boundary values lat $lat, long $long', async (coords) => {
    await db.insert(properties).values(row(coords));

    expect(await countProperties(db)).toBe(1);
  });

  it('RQ-02: defaults id to a UUID v7 and created_at to now()', async () => {
    const [inserted] = await db.insert(properties).values(row()).returning();
    if (inserted === undefined) throw new Error('expected a row');

    const result = await db.execute<{ version: number; age_seconds: number }>(
      sql`SELECT uuid_extract_version(${properties.id}) AS version,
                 extract(epoch FROM now() - ${properties.createdAt})::float AS age_seconds
          FROM ${properties} WHERE ${properties.id} = ${inserted.id}`,
    );

    expect(result.rows[0]?.version).toBe(7);
    expect(result.rows[0]?.age_seconds).toBeGreaterThanOrEqual(0);
    expect(result.rows[0]?.age_seconds).toBeLessThan(60);
    expect(inserted.createdAt).toBeInstanceOf(Date);
  });
});
