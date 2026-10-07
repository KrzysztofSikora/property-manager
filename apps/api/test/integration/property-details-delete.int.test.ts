import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/app.ts';
import type { TestApp } from '../helpers/app.ts';
import { countProperties, resetDb, seedProperty } from '../helpers/db.ts';
import { expectGraphQLError } from '../helpers/graphql.ts';
import { DELETE_PROPERTY, PROPERTIES, PROPERTY } from '../operations.ts';
import type { FakeWeatherClient } from '../fakes/weather.ts';

const NOT_FOUND = 'No property with this id exists.';

const apps: TestApp[] = [];

function testApp(): TestApp<FakeWeatherClient> {
  const app = createTestApp();
  apps.push(app);
  return app;
}

beforeEach(async () => {
  const app = testApp();
  await resetDb(app.db);
});

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('property (FR-04)', () => {
  it('FR-04 AC1: returns every field of the stored property', async () => {
    const app = testApp();
    await seedProperty(app.db, { street: '1 Main St' });
    const stored = await seedProperty(app.db);

    const result = await app.execute(PROPERTY, { id: stored.id });

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      property: {
        id: stored.id,
        street: stored.street,
        city: stored.city,
        state: stored.state,
        zipCode: stored.zipCode,
        lat: stored.lat,
        long: stored.long,
        createdAt: stored.createdAt.toISOString(),
        weatherData: {
          units: 'IMPERIAL',
          current: {
            temperature: 82,
            feelsLike: 79,
            weatherDescriptions: ['Clear '],
            weatherIcons: [
              'https://cdn.worldweatheronline.com/images/wsymbols01_png_64/wsymbol_0008_clear_sky_night.png',
            ],
            windSpeed: 6,
            windDir: 'NE',
            humidity: 34,
            raw: stored.weatherData.current,
          },
        },
      },
    });
  });

  it('FR-04 AC2: returns null without errors for an unknown id', async () => {
    const app = testApp();
    await seedProperty(app.db);

    expect(await app.execute(PROPERTY, { id: crypto.randomUUID() })).toEqual({
      data: { property: null },
    });
  });

  it('FR-04 AC3: makes no weather call', async () => {
    const app = testApp();
    const stored = await seedProperty(app.db);

    await app.execute(PROPERTY, { id: stored.id });
    await app.execute(PROPERTY, { id: crypto.randomUUID() });

    expect(app.weather.calls).toEqual([]);
  });

  it('FR-04 AC4 / TR-15: returns null without errors for a malformed id', async () => {
    const app = testApp();

    expect(await app.execute(PROPERTY, { id: 'not-a-uuid' })).toEqual({
      data: { property: null },
    });
    expect(app.logs()).not.toContainEqual(expect.objectContaining({ msg: 'unexpected error' }));
  });
});

describe('deleteProperty (FR-09)', () => {
  it('FR-09 AC1: returns the id; property(id) is then null and totalCount drops by one', async () => {
    const app = testApp();
    const kept = await seedProperty(app.db, { street: '1 Main St' });
    const deleted = await seedProperty(app.db);

    const result = await app.execute(DELETE_PROPERTY, { id: deleted.id });

    expect(result).toEqual({ data: { deleteProperty: deleted.id } });
    expect(await app.execute(PROPERTY, { id: deleted.id })).toEqual({
      data: { property: null },
    });
    const list = await app.execute(PROPERTIES);
    expect(list.data).toMatchObject({
      properties: { items: [{ id: kept.id }], totalCount: 1 },
    });
  });

  it.each([
    ['an unknown UUID', () => crypto.randomUUID()],
    ['a malformed id', () => 'not-a-uuid'],
  ])('FR-09 AC2 / TR-15: %s returns PROPERTY_NOT_FOUND and deletes nothing', async (_label, id) => {
    const app = testApp();
    await seedProperty(app.db);

    const result = await app.execute(DELETE_PROPERTY, { id: id() });

    const error = expectGraphQLError(result, 'PROPERTY_NOT_FOUND');
    expect(error.message).toBe(NOT_FOUND);
    expect(error.extensions).toEqual({ code: 'PROPERTY_NOT_FOUND' });
    expect(error.path).toEqual(['deleteProperty']);
    expect(result.data).toBeNull();
    expect(await countProperties(app.db)).toBe(1);
    expect(app.logs()).not.toContainEqual(expect.objectContaining({ msg: 'unexpected error' }));
  });

  it('FR-09 AC2: a second delete of the same id returns PROPERTY_NOT_FOUND', async () => {
    const app = testApp();
    const stored = await seedProperty(app.db);
    await app.execute(DELETE_PROPERTY, { id: stored.id });

    const result = await app.execute(DELETE_PROPERTY, { id: stored.id });

    expect(expectGraphQLError(result, 'PROPERTY_NOT_FOUND').message).toBe(NOT_FOUND);
  });

  it('FR-09 AC3: makes no weather call', async () => {
    const app = testApp();
    const stored = await seedProperty(app.db);

    await app.execute(DELETE_PROPERTY, { id: stored.id });
    await app.execute(DELETE_PROPERTY, { id: stored.id });
    await app.execute(DELETE_PROPERTY, { id: 'not-a-uuid' });

    expect(app.weather.calls).toEqual([]);
  });
});
