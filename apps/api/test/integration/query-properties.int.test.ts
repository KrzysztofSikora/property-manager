import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { NewPropertyRow, PropertyRow } from '../../src/db/schema.ts';
import { createTestApp } from '../helpers/app.ts';
import type { ExecuteResult, TestApp } from '../helpers/app.ts';
import { resetDb, seedProperty } from '../helpers/db.ts';
import { expectGraphQLError } from '../helpers/graphql.ts';
import { PROPERTIES } from '../operations.ts';
import type { FakeWeatherClient } from '../fakes/weather.ts';

const T0 = Date.parse('2026-01-01T00:00:00.000Z');

const apps: TestApp[] = [];

function testApp(): TestApp<FakeWeatherClient> {
  const app = createTestApp();
  apps.push(app);
  return app;
}

type Page = { items: Record<string, unknown>[]; totalCount: number };

function page(result: ExecuteResult): Page {
  expect(result.errors).toBeUndefined();
  const { data } = result;
  if (typeof data !== 'object' || data === null || !('properties' in data)) {
    return expect.fail('no properties in the result');
  }
  const { properties } = data;
  if (
    typeof properties !== 'object' ||
    properties === null ||
    !('items' in properties) ||
    !Array.isArray(properties.items) ||
    !('totalCount' in properties) ||
    typeof properties.totalCount !== 'number'
  ) {
    return expect.fail('properties is not a page');
  }
  const items: Record<string, unknown>[] = properties.items.map((item: unknown) => ({
    ...(typeof item === 'object' && item !== null ? item : {}),
  }));
  return { items, totalCount: properties.totalCount };
}

const ids = ({ items }: Page): unknown[] => items.map((item) => item.id);
const cities = ({ items }: Page): unknown[] => items.map((item) => item.city);

// A distinct street per row, so seeds never trip `properties_address_unique`. Row i is created
// i seconds after T0 unless `overrides(i)` says otherwise.
async function seedMany(
  app: TestApp,
  n: number,
  overrides: (i: number) => Partial<NewPropertyRow> = () => ({}),
): Promise<PropertyRow[]> {
  const rows: PropertyRow[] = [];
  for (let i = 0; i < n; i += 1) {
    rows.push(
      await seedProperty(app.db, {
        street: `${String(i + 1)} Main St`,
        createdAt: new Date(T0 + i * 1000),
        ...overrides(i),
      }),
    );
  }
  return rows;
}

// One row per entry, in the given order of creation.
function seedEach(app: TestApp, rows: Partial<NewPropertyRow>[]): Promise<PropertyRow[]> {
  return seedMany(app, rows.length, (i) => rows[i] ?? {});
}

beforeEach(async () => {
  const app = testApp();
  await resetDb(app.db);
});

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('properties: list and paging (FR-01)', () => {
  it('FR-01 AC1: returns every stored property with all its fields, and the count', async () => {
    const app = testApp();
    const rows = await seedMany(app, 3);

    const result = page(await app.execute(PROPERTIES));

    expect(result.totalCount).toBe(3);
    expect(result.items).toHaveLength(3);
    const newest = rows[2];
    if (newest === undefined) return expect.fail('no seeded row');
    const { weatherData, ...fields } = result.items[0] ?? {};
    expect(fields).toEqual({
      id: newest.id,
      street: newest.street,
      city: newest.city,
      state: newest.state,
      zipCode: newest.zipCode,
      lat: newest.lat,
      long: newest.long,
      createdAt: newest.createdAt.toISOString(),
    });
    expect(weatherData).toMatchObject({
      units: 'IMPERIAL',
      current: { raw: newest.weatherData.current },
    });
  });

  it('FR-01 AC2: with no stored properties, returns an empty page and no error', async () => {
    const app = testApp();

    expect(page(await app.execute(PROPERTIES))).toEqual({ items: [], totalCount: 0 });
  });

  it('FR-01 AC3: without a limit, returns all 25 properties', async () => {
    const app = testApp();
    await seedMany(app, 25);

    const result = page(await app.execute(PROPERTIES));

    expect(result.items).toHaveLength(25);
    expect(result.totalCount).toBe(25);
  });

  it('FR-01 AC4: limit 10, offset 20 of 25 returns the last 5, and the full count', async () => {
    const app = testApp();
    const rows = await seedMany(app, 25);

    const result = page(await app.execute(PROPERTIES, { limit: 10, offset: 20 }));

    // Newest first: offset 20 skips rows 25..6.
    expect(ids(result)).toEqual(
      rows
        .slice(0, 5)
        .reverse()
        .map((row) => row.id),
    );
    expect(result.totalCount).toBe(25);
  });

  it.each([
    [{ limit: 0 }, 'limit', 'must be between 1 and 100'],
    [{ limit: 101 }, 'limit', 'must be between 1 and 100'],
    [{ offset: -1 }, 'offset', 'must be 0 or greater'],
  ])(
    'FR-01 AC5, FR-10 AC1: %o returns BAD_USER_INPUT and no items',
    async (args, field, message) => {
      const app = testApp();
      await seedMany(app, 1);

      const result = await app.execute(PROPERTIES, args);

      const error = expectGraphQLError(result, 'BAD_USER_INPUT');
      expect(error.extensions.fields).toEqual([{ field, message }]);
      expect(result.data).toBeNull();
    },
  );

  it('FR-01 AC5: limit 100 is accepted, and an offset without a limit returns every match after it', async () => {
    const app = testApp();
    const rows = await seedMany(app, 3);

    expect(page(await app.execute(PROPERTIES, { limit: 100 })).totalCount).toBe(3);
    const afterOne = page(await app.execute(PROPERTIES, { offset: 1 }));

    expect(ids(afterOne)).toEqual([rows[1]?.id, rows[0]?.id]);
    expect(afterOne.totalCount).toBe(3);
  });

  it('FR-01 AC6, TR-04: listing, sorting, filtering and paging call the weather adapter 0 times', async () => {
    const app = testApp();
    await seedMany(app, 3);

    page(await app.execute(PROPERTIES));
    page(
      await app.execute(PROPERTIES, {
        filter: { city: 'fountain', state: 'az', zipCode: '85268' },
        sort: 'CREATED_AT_ASC',
        limit: 2,
        offset: 1,
      }),
    );
    await app.execute(PROPERTIES, { limit: 0 });

    expect(app.weather.calls).toEqual([]);
  });
});

describe('properties: sort (FR-02)', () => {
  it('FR-02 AC1: without a sort, the newest comes first', async () => {
    const app = testApp();
    const [p1, p2, p3] = await seedMany(app, 3);

    expect(ids(page(await app.execute(PROPERTIES)))).toEqual([p3?.id, p2?.id, p1?.id]);
  });

  it('FR-02 AC2: CREATED_AT_ASC puts the oldest first', async () => {
    const app = testApp();
    const [p1, p2, p3] = await seedMany(app, 3);

    expect(ids(page(await app.execute(PROPERTIES, { sort: 'CREATED_AT_ASC' })))).toEqual([
      p1?.id,
      p2?.id,
      p3?.id,
    ]);
  });

  // Equal `createdAt` for all 25, so only the `id` tiebreak orders them. Random v4 ids, because
  // `uuidv7()` ids would follow insertion order and pass without a tiebreak. The expected order
  // is a plain code-unit sort, which is PostgreSQL's byte order for lowercase canonical UUIDs.
  it.each([
    ['CREATED_AT_ASC', (sorted: string[]) => sorted],
    ['CREATED_AT_DESC', (sorted: string[]) => sorted.reverse()],
  ])(
    'FR-02 AC3, TR-14: %s pages at offsets 0 and 20 hold all 25 ids once, in id order',
    async (sort, direction) => {
      const app = testApp();
      const rows = await seedMany(app, 25, () => ({
        id: crypto.randomUUID(),
        createdAt: new Date(T0),
      }));

      const first = page(await app.execute(PROPERTIES, { sort, limit: 20, offset: 0 }));
      const second = page(await app.execute(PROPERTIES, { sort, limit: 20, offset: 20 }));

      expect(first.items).toHaveLength(20);
      expect(second.items).toHaveLength(5);
      expect([...ids(first), ...ids(second)]).toEqual(direction(rows.map((row) => row.id).sort()));
    },
  );
});

describe('properties: filters (FR-03)', () => {
  it('FR-03 AC1: city is a case-insensitive contains match', async () => {
    const app = testApp();
    await seedEach(app, [{ city: 'Fountain Hills' }, { city: 'Phoenix' }]);

    const result = page(await app.execute(PROPERTIES, { filter: { city: 'fountain' } }));

    expect(cities(result)).toEqual(['Fountain Hills']);
    expect(result.totalCount).toBe(1);
  });

  it('FR-03 AC1: the city filter collapses whitespace like stored cities', async () => {
    const app = testApp();
    await seedEach(app, [{ city: 'Fountain Hills' }, { city: 'Phoenix' }]);

    const result = page(await app.execute(PROPERTIES, { filter: { city: ' fountain   hills ' } }));

    expect(cities(result)).toEqual(['Fountain Hills']);
  });

  it('FR-03 AC2: state is upper-cased and matched exactly', async () => {
    const app = testApp();
    const [az1, , az2] = await seedEach(app, [
      { state: 'AZ' },
      { state: 'CA', city: 'Los Angeles', zipCode: '90001' },
      { state: 'AZ', city: 'Phoenix', zipCode: '85001' },
    ]);

    const result = page(await app.execute(PROPERTIES, { filter: { state: 'az' } }));

    expect(ids(result)).toEqual([az2?.id, az1?.id]);
    expect(result.totalCount).toBe(2);
  });

  it('FR-03 AC3: zip code is an exact match, so a partial zip matches nothing', async () => {
    const app = testApp();
    const [z85268] = await seedEach(app, [{ zipCode: '85268' }, { zipCode: '85260' }]);

    expect(page(await app.execute(PROPERTIES, { filter: { zipCode: '8526' } }))).toEqual({
      items: [],
      totalCount: 0,
    });
    const exact = page(await app.execute(PROPERTIES, { filter: { zipCode: '85268' } }));
    expect(ids(exact)).toEqual([z85268?.id]);
    expect(exact.totalCount).toBe(1);
  });

  it('FR-03 AC4: city and state combine with AND', async () => {
    const app = testApp();
    const [phoenixAz] = await seedEach(app, [
      { city: 'Phoenix', state: 'AZ', zipCode: '85001' },
      { city: 'Phoenix', state: 'OR', zipCode: '97535' },
      { city: 'Fountain Hills', state: 'AZ' },
    ]);

    const result = page(
      await app.execute(PROPERTIES, { filter: { city: 'phoenix', state: 'AZ' } }),
    );

    expect(ids(result)).toEqual([phoenixAz?.id]);
    expect(result.totalCount).toBe(1);
  });

  it('FR-03 AC5: the filter applies before sort and paging, and totalCount counts the matches', async () => {
    const app = testApp();
    // Rows 0, 2, 4, 6, 8 are in Phoenix; the others in Fountain Hills.
    const rows = await seedMany(app, 10, (i) => (i % 2 === 0 ? { city: 'Phoenix' } : {}));
    const phoenix = rows.filter((_row, i) => i % 2 === 0);

    const result = page(
      await app.execute(PROPERTIES, {
        filter: { city: 'phoenix' },
        sort: 'CREATED_AT_ASC',
        limit: 2,
        offset: 1,
      }),
    );

    expect(ids(result)).toEqual([phoenix[1]?.id, phoenix[2]?.id]);
    expect(result.totalCount).toBe(5);
  });

  it.each([
    ['empty', ''],
    ['whitespace-only', '   '],
    ['null', null],
  ])('FR-03 AC6: an %s filter value is ignored', async (_case, value) => {
    const app = testApp();
    await seedEach(app, [{ city: 'Fountain Hills' }, { city: 'Phoenix', zipCode: '85001' }]);

    const result = page(
      await app.execute(PROPERTIES, { filter: { city: value, state: value, zipCode: value } }),
    );

    expect(result.totalCount).toBe(2);
  });

  it.each(['%', '_'])(
    'TR-13: city "%s" is matched literally, so it finds nothing',
    async (city) => {
      const app = testApp();
      await seedEach(app, [{ city: 'Fountain Hills' }, { city: 'Phoenix' }]);

      expect(page(await app.execute(PROPERTIES, { filter: { city } }))).toEqual({
        items: [],
        totalCount: 0,
      });
    },
  );

  it.each([
    ['%', '100% Town'],
    ['_', 'St_Paul'],
    ['\\', 'Back\\Slash'],
  ])('TR-13: city "%s" finds only the city that contains it', async (city, expected) => {
    const app = testApp();
    await seedEach(app, [
      { city: '100% Town' },
      { city: 'St_Paul' },
      { city: 'Back\\Slash' },
      { city: 'Stx Paul' },
      { city: '1000 Town' },
    ]);

    const result = page(await app.execute(PROPERTIES, { filter: { city } }));

    expect(cities(result)).toEqual([expected]);
    expect(result.totalCount).toBe(1);
  });

  it('TR-13, FR-10 AC1: an over-long filter value returns BAD_USER_INPUT for that field', async () => {
    const app = testApp();

    const result = await app.execute(PROPERTIES, { filter: { city: 'a'.repeat(101) } });

    const error = expectGraphQLError(result, 'BAD_USER_INPUT');
    expect(error.extensions.fields).toEqual([
      { field: 'filter.city', message: 'must be at most 100 characters' },
    ]);
    expect(result.data).toBeNull();
  });
});
