import pg from 'pg';
import { describe, expect, inject, it } from 'vitest';
import { createApp } from '../../src/app.ts';
import { loadConfig } from '../../src/config/env.ts';
import { createLogger } from '../../src/logger.ts';

describe('integration harness', () => {
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
    const config = loadConfig({
      WEATHERSTACK_KEY: 'TEST_WEATHERSTACK_KEY',
      DATABASE_URL: inject('databaseUrl'),
    });
    const { yoga } = createApp({ config, logger: createLogger('silent') });

    const response = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{ health }' }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { health: 'ok' } });
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
