import pg from 'pg';
import { afterAll, describe, expect, inject, it } from 'vitest';
import { createTestApp } from '../helpers/app.ts';
import { countProperties, resetDb, seedProperty } from '../helpers/db.ts';
import { expectNoSecret } from '../helpers/secrets.ts';

describe('integration harness', () => {
  const app = createTestApp();

  afterAll(app.close);

  it('connects to the Testcontainers database', async () => {
    const client = new pg.Client({ connectionString: inject('databaseUrl') });
    await client.connect();
    try {
      const result = await client.query<{ one: number }>('select 1 as one');
      expect(result.rows).toEqual([{ one: 1 }]);
    } finally {
      await client.end();
    }
  });

  it('answers the health query in process', async () => {
    const result = await app.execute('{ health }');

    expect(result).toEqual({ data: { health: 'ok' } });
    expect(app.logs()).toContainEqual(expect.objectContaining({ msg: 'graphql operation' }));
    expectNoSecret(result, app.logs());
  });

  it('seeds, counts and resets properties on the migrated database', async () => {
    await resetDb(app.db);

    const row = await seedProperty(app.db, { createdAt: new Date('2026-01-02T03:04:05Z') });

    expect(row).toMatchObject({
      street: '15528 E Golden Eagle Blvd',
      state: 'AZ',
      lat: 33.609,
      long: -111.729,
      createdAt: new Date('2026-01-02T03:04:05Z'),
    });
    expect(row.weatherData.units).toBe('IMPERIAL');
    expect(row.weatherData.current).toHaveProperty('temperature', 82);
    expect(await countProperties(app.db)).toBe(1);

    await resetDb(app.db);
    expect(await countProperties(app.db)).toBe(0);
  });
});

it('TR-25: an unmocked outbound request fails an integration test too', async () => {
  const error: unknown = await fetch('https://api.weatherstack.com/current').then(
    () => undefined,
    (reason: unknown) => reason,
  );
  // The cause proves MSW blocked it, not an offline network.
  if (!(error instanceof TypeError)) throw new Error('expected fetch to reject with a TypeError');
  expect(String(error.cause)).toContain('onUnhandledFrame');
});
