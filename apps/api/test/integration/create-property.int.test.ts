import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { properties } from '../../src/db/schema.ts';
import { InMemoryPropertyRepository } from '../fakes/property-repository.ts';
import { FakeWeatherClient } from '../fakes/weather.ts';
import { validInput } from '../fixtures/property.ts';
import { weatherstackError, weatherstackResponse } from '../fixtures/weatherstack.ts';
import { createTestApp } from '../helpers/app.ts';
import type { ExecuteResult, TestApp, TestAppOptions } from '../helpers/app.ts';
import { countProperties, resetDb } from '../helpers/db.ts';
import { expectGraphQLError } from '../helpers/graphql.ts';
import { expectNoSecret, TEST_WEATHERSTACK_KEY } from '../helpers/secrets.ts';
import { weatherstackHandlers } from '../msw/weatherstack.ts';
import type { RecordingHandler } from '../msw/weatherstack.ts';
import { CREATE_PROPERTY, PROPERTY } from '../operations.ts';
import { server } from '../setup/msw.ts';

const UNAVAILABLE = 'Weather could not be fetched, so the property was not saved. Try again later.';
const QUOTA_EXCEEDED =
  'The Weatherstack usage limit has been reached, so the property was not saved. Upgrade the Weatherstack plan or replace the API key.';
const QUERY = '15528 E Golden Eagle Blvd, Fountain Hills, AZ 85268, United States';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// What an unexpected error must never show the caller (FR-10 AC2).
const SQL_AND_PATH =
  'insert into "properties" ("street") values ($1) at /srv/app/src/db/client.ts:12';

const apps: TestApp[] = [];

function testApp(options?: TestAppOptions<FakeWeatherClient>): TestApp<FakeWeatherClient> {
  const app = createTestApp(options);
  apps.push(app);
  return app;
}

function createdProperty(result: ExecuteResult): Record<string, unknown> {
  expect(result.errors).toBeUndefined();
  const { data } = result;
  if (typeof data !== 'object' || data === null || !('createProperty' in data)) {
    return expect.fail('no createProperty in the result');
  }
  const property = data.createProperty;
  if (typeof property !== 'object' || property === null) {
    return expect.fail('createProperty is null');
  }
  return { ...property };
}

function expectNoInternals(result: ExecuteResult): void {
  const text = JSON.stringify(result);
  for (const fragment of ['insert into', '/srv/app', 'client.ts', 'stack', 'originalError']) {
    expect(text).not.toContain(fragment);
  }
}

beforeEach(async () => {
  const app = testApp();
  await resetDb(app.db);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('createProperty', () => {
  it('FR-05 AC1: returns the new property with the weather snapshot, and property(id) returns it again', async () => {
    const app = testApp();

    const created = createdProperty(await app.execute(CREATE_PROPERTY, validInput()));

    const { id, createdAt, ...rest } = created;
    expect(id).toMatch(UUID);
    expect(Date.now() - Date.parse(String(createdAt))).toBeLessThan(60_000);
    // Key fields as in the recorded sample's `current`; `raw` is that object whole.
    expect(rest).toEqual({
      street: '15528 E Golden Eagle Blvd',
      city: 'Fountain Hills',
      state: 'AZ',
      zipCode: '85268',
      lat: 33.609,
      long: -111.729,
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
          raw: weatherstackResponse().current,
        },
      },
    });
    expect(await app.execute(PROPERTY, { id: created.id })).toEqual({
      data: { property: created },
    });
  });

  it('FR-05 AC2: calls the weather client exactly once, with the normalized address', async () => {
    const app = testApp();

    await app.execute(CREATE_PROPERTY, validInput());

    expect(app.weather.calls).toEqual([QUERY]);
  });

  it('FR-05 AC3: stores and returns the normalized address, case kept', async () => {
    const app = testApp();

    const created = createdProperty(
      await app.execute(
        CREATE_PROPERTY,
        validInput({
          street: '  15528  E Golden Eagle Blvd ',
          city: ' Fountain   Hills',
          state: 'az',
        }),
      ),
    );

    expect(created).toMatchObject({
      street: '15528 E Golden Eagle Blvd',
      city: 'Fountain Hills',
      state: 'AZ',
    });
    const rows = await app.db.select().from(properties);
    expect(rows).toEqual([
      expect.objectContaining({
        street: '15528 E Golden Eagle Blvd',
        city: 'Fountain Hills',
        state: 'AZ',
      }),
    ]);
    expect(app.weather.calls).toEqual([QUERY]);
  });

  it('FR-07 AC2: keeps a leading-zero zip as a string', async () => {
    const app = testApp();

    const created = createdProperty(
      await app.execute(
        CREATE_PROPERTY,
        validInput({ street: '1 Beacon St', city: 'Boston', state: 'MA', zipCode: '02108' }),
      ),
    );

    expect(created.zipCode).toBe('02108');
    expect(app.weather.calls).toEqual(['1 Beacon St, Boston, MA 02108, United States']);
  });

  it.each([
    ['FR-07 AC1', { zipCode: '8526' }, 'zipCode', 'must be 5 digits'],
    ['FR-07 AC1', { zipCode: '85268-1234' }, 'zipCode', 'must be 5 digits'],
    ['FR-07 AC3', { state: 'PR' }, 'state', 'must be a 2-letter US state code (50 states or DC)'],
    [
      'FR-07 AC3',
      { state: 'Arizona' },
      'state',
      'must be a 2-letter US state code (50 states or DC)',
    ],
    ['FR-07 AC4', { street: '   ' }, 'street', 'must not be empty'],
    ['FR-07 AC4', { city: 'x'.repeat(101) }, 'city', 'must be at most 100 characters'],
  ])(
    '%s: rejects %j with BAD_USER_INPUT on %s and no weather call',
    async (_ac, input, field, message) => {
      const app = testApp();

      const result = await app.execute(CREATE_PROPERTY, validInput(input));

      const error = expectGraphQLError(result, 'BAD_USER_INPUT');
      expect(error.extensions.fields).toEqual([{ field, message }]);
      expect(result.data).toEqual({ createProperty: null });
      expect(await countProperties(app.db)).toBe(0);
      expect(app.weather.calls).toEqual([]);
    },
  );

  it('FR-07 AC5: lists every invalid field in one BAD_USER_INPUT error', async () => {
    const app = testApp();

    const result = await app.execute(
      CREATE_PROPERTY,
      validInput({ street: '', state: 'XX', zipCode: '123' }),
    );

    const error = expectGraphQLError(result, 'BAD_USER_INPUT');
    expect(error.message).toBe(
      'Invalid input: street (must not be empty), state (must be a 2-letter US state code (50 states or DC)), zipCode (must be 5 digits)',
    );
    expect(error.extensions.fields).toEqual([
      { field: 'street', message: 'must not be empty' },
      { field: 'state', message: 'must be a 2-letter US state code (50 states or DC)' },
      { field: 'zipCode', message: 'must be 5 digits' },
    ]);
    expect(app.weather.calls).toEqual([]);
  });

  it('FR-05 AC6: a rejected save returns INTERNAL_SERVER_ERROR without SQL or a path, and stores nothing', async () => {
    const repository = new InMemoryPropertyRepository();
    repository.failInsert(new Error(SQL_AND_PATH));
    const app = testApp({ repository });

    const result = await app.execute(CREATE_PROPERTY, validInput());

    const error = expectGraphQLError(result, 'INTERNAL_SERVER_ERROR');
    expect(error.message).toBe('Unexpected error.');
    expect(error.path).toEqual(['createProperty']);
    expectNoInternals(result);
    expect(repository.rows).toEqual([]);
    expect(await countProperties(app.db)).toBe(0);
    expect(app.weather.calls).toEqual([QUERY]);
    const operation = app.logs().find((line) => line.msg === 'graphql operation');
    expect(operation?.requestId).toMatch(UUID);
    expect(app.logs()).toContainEqual(
      expect.objectContaining({
        level: 50,
        msg: 'unexpected error',
        requestId: operation?.requestId,
      }),
    );
    expect(JSON.stringify(app.logs())).not.toContain('insert into');
  });

  it('FR-05 AC6: a save the database rejects (lat out of range) returns INTERNAL_SERVER_ERROR and stores nothing', async () => {
    const app = testApp({
      weather: new FakeWeatherClient(weatherstackResponse({ location: { lat: '999' } })),
    });

    const result = await app.execute(CREATE_PROPERTY, validInput());

    expectGraphQLError(result, 'INTERNAL_SERVER_ERROR');
    const text = JSON.stringify(result);
    expect(text).not.toContain('properties_lat_range');
    expect(text).not.toContain('insert into');
    expect(await countProperties(app.db)).toBe(0);
    // R1: the log names the constraint, but not the insert, the address or the weather.
    const logged = app.logs().filter((line) => line.msg === 'unexpected error');
    expect(logged).toHaveLength(1);
    expect(JSON.stringify(logged[0])).toContain('properties_lat_range');
    expect(JSON.stringify(app.logs())).not.toMatch(/Golden Eagle|insert into|worldweatheronline/);
  });

  it('FR-10 AC2: adds no originalError or stack when NODE_ENV is development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const repository = new InMemoryPropertyRepository();
    repository.failInsert(new Error(SQL_AND_PATH));
    const app = testApp({ repository });

    const result = await app.execute(CREATE_PROPERTY, validInput());

    const error = expectGraphQLError(result, 'INTERNAL_SERVER_ERROR');
    expect(error.extensions).toEqual({ code: 'INTERNAL_SERVER_ERROR' });
    expectNoInternals(result);
  });
});

describe('property', () => {
  it('returns null for a malformed id, without an error', async () => {
    const app = testApp();

    expect(await app.execute(PROPERTY, { id: 'not-a-uuid' })).toEqual({ data: { property: null } });
    expect(app.weather.calls).toEqual([]);
  });

  it('returns null for an unknown id', async () => {
    const app = testApp();

    expect(await app.execute(PROPERTY, { id: crypto.randomUUID() })).toEqual({
      data: { property: null },
    });
  });
});

describe('createProperty through the real Weatherstack client (MSW)', () => {
  function mswApp(): TestApp {
    const app = createTestApp({ weather: 'msw' });
    apps.push(app);
    return app;
  }

  it('FR-05 AC2: sends one request with the normalized address and units=f, and stores the property', async () => {
    const ok = weatherstackHandlers.ok();
    server.use(ok.handler);
    const app = mswApp();

    const created = createdProperty(await app.execute(CREATE_PROPERTY, validInput()));

    expect(created).toMatchObject({ lat: 33.609, long: -111.729 });
    expect(ok.requests).toHaveLength(1);
    const [request] = ok.requests;
    expect(request?.searchParams.get('query')).toBe(QUERY);
    expect(request?.searchParams.get('units')).toBe('f');
    expect(request?.searchParams.get('access_key') === TEST_WEATHERSTACK_KEY).toBe(true);
    expect(await countProperties(app.db)).toBe(1);
  });

  it('TR-01: a 500 returns WEATHER_UNAVAILABLE, stores nothing and leaks no key', async () => {
    const failing = weatherstackHandlers.status(500);
    server.use(failing.handler);
    const app = mswApp();

    const result = await app.execute(CREATE_PROPERTY, validInput());

    expectGraphQLError(result, 'WEATHER_UNAVAILABLE');
    expect(failing.requests).toHaveLength(1);
    expect(await countProperties(app.db)).toBe(0);
    expectNoSecret(result, app.logs());
    const warnings = app.logs().filter((line) => line.level === 40);
    expect(warnings).toHaveLength(1);
    expect(String(warnings[0]?.url)).toContain('access_key=[REDACTED]');
    const operation = app.logs().find((line) => line.msg === 'graphql operation');
    expect(operation?.requestId).toMatch(UUID);
    expect(warnings[0]?.requestId).toBe(operation?.requestId);
  });

  // FR-05 AC5, FR-06 AC1/AC2/AC4/AC5/AC7, FR-10 AC1. The timeout (AC3) is an adapter test.
  it.each<[string, () => RecordingHandler, string, string]>([
    [
      'body code 104',
      () => weatherstackHandlers.ok(weatherstackError(104, 'usage_limit_reached')),
      'WEATHER_QUOTA_EXCEEDED',
      QUOTA_EXCEEDED,
    ],
    [
      'body code 429',
      () => weatherstackHandlers.ok(weatherstackError(429, 'too_many_requests')),
      'WEATHER_QUOTA_EXCEEDED',
      QUOTA_EXCEEDED,
    ],
    [
      'body code 101',
      () => weatherstackHandlers.ok(weatherstackError(101, 'unauthorized')),
      'WEATHER_UNAVAILABLE',
      UNAVAILABLE,
    ],
    [
      'body code 105',
      () => weatherstackHandlers.ok(weatherstackError(105, 'https_access_restricted')),
      'WEATHER_UNAVAILABLE',
      UNAVAILABLE,
    ],
    [
      'body code 403',
      () => weatherstackHandlers.ok(weatherstackError(403, 'forbidden')),
      'WEATHER_UNAVAILABLE',
      UNAVAILABLE,
    ],
    [
      'body code 615',
      () => weatherstackHandlers.ok(weatherstackError(615, 'request_failed')),
      'WEATHER_UNAVAILABLE',
      UNAVAILABLE,
    ],
    [
      'an unknown body code',
      () => weatherstackHandlers.ok(weatherstackError(999, 'unknown')),
      'WEATHER_UNAVAILABLE',
      UNAVAILABLE,
    ],
    [
      'success: false without an error',
      () => weatherstackHandlers.ok({ success: false }),
      'WEATHER_UNAVAILABLE',
      UNAVAILABLE,
    ],
    ['HTTP 500', () => weatherstackHandlers.status(500), 'WEATHER_UNAVAILABLE', UNAVAILABLE],
    ['HTTP 503', () => weatherstackHandlers.status(503), 'WEATHER_UNAVAILABLE', UNAVAILABLE],
    ['HTTP 429', () => weatherstackHandlers.status(429), 'WEATHER_UNAVAILABLE', UNAVAILABLE],
    [
      'a network error',
      () => weatherstackHandlers.networkError(),
      'WEATHER_UNAVAILABLE',
      UNAVAILABLE,
    ],
    [
      'a 200 that is not JSON',
      () => weatherstackHandlers.text('<html>busy</html>'),
      'WEATHER_UNAVAILABLE',
      UNAVAILABLE,
    ],
    [
      'a missing key field',
      () => weatherstackHandlers.ok(weatherstackResponse({ current: { humidity: undefined } })),
      'WEATHER_UNAVAILABLE',
      UNAVAILABLE,
    ],
  ])(
    'FR-05 AC5: %s returns %s after one request, stores nothing and leaks no key',
    async (_case, make, code, message) => {
      const { handler, requests } = make();
      server.use(handler);
      const app = mswApp();

      const result = await app.execute(CREATE_PROPERTY, validInput());

      const error = expectGraphQLError(result, code);
      expect(error.message).toBe(message);
      expect(result.data).toEqual({ createProperty: null });
      expect(requests).toHaveLength(1);
      expect(await countProperties(app.db)).toBe(0);
      expectNoSecret(result, app.logs());
      const loggedUrls = app.logs().flatMap((line) => ('url' in line ? [String(line.url)] : []));
      expect(loggedUrls).toHaveLength(1);
      expect(loggedUrls[0]).toContain('access_key=[REDACTED]');
    },
  );

  it('FR-06 AC6: body code 101 writes one configuration error log line for the request, without the key', async () => {
    server.use(
      weatherstackHandlers.ok(
        weatherstackError(101, 'invalid_access_key', `Invalid key ${TEST_WEATHERSTACK_KEY}`),
      ).handler,
    );
    const app = mswApp();

    const result = await app.execute(CREATE_PROPERTY, validInput());

    expectGraphQLError(result, 'WEATHER_UNAVAILABLE');
    const operation = app.logs().find((line) => line.msg === 'graphql operation');
    expect(operation?.requestId).toMatch(UUID);
    const configErrors = app
      .logs()
      .filter((line) => line.msg === 'Weatherstack configuration error');
    expect(configErrors).toHaveLength(1);
    expect(configErrors[0]).toMatchObject({ level: 50, requestId: operation?.requestId });
    expect(String(configErrors[0]?.url)).toContain('access_key=[REDACTED]');
    expectNoSecret(result, app.logs());
  });
});
