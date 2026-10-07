import { inject } from 'vitest';
import { createWeatherstackClient } from '../../src/adapters/weatherstack/client.ts';
import { createApp } from '../../src/app.ts';
import { loadConfig } from '../../src/config/env.ts';
import { createDb } from '../../src/db/client.ts';
import type { Database } from '../../src/db/client.ts';
import type { PropertyRepository, WeatherClient } from '../../src/domain/ports.ts';
import { createPropertyRepository } from '../../src/repositories/property.repository.ts';
import { FakeWeatherClient } from '../fakes/weather.ts';
import { captureLogs } from './logs.ts';
import type { LogLine } from './logs.ts';
import { TEST_WEATHERSTACK_KEY } from './secrets.ts';

export type ExecuteResult = { data?: unknown; errors?: unknown[] };

export type TestApp<W extends WeatherClient = WeatherClient> = {
  db: Database;
  weather: W;
  execute: (document: string, variables?: Record<string, unknown>) => Promise<ExecuteResult>;
  logs: () => LogLine[];
  close: () => Promise<void>;
};

// `weather`: a fake (the default serves the recorded sample), or 'msw' for the real
// Weatherstack client against the MSW handlers. `repository`: replaces the Drizzle repository,
// e.g. one whose insert throws (FR-05 AC6); `db` still points at the test database.
export type TestAppOptions<W> = { weather?: W; repository?: PropertyRepository };

function isExecuteResult(value: unknown): value is ExecuteResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    (!('errors' in value) || Array.isArray(value.errors))
  );
}

// The real composition root against the Testcontainers database, with the sentinel key and a
// captured logger.
export function createTestApp(
  options?: TestAppOptions<FakeWeatherClient>,
): TestApp<FakeWeatherClient>;
export function createTestApp(options: TestAppOptions<'msw'>): TestApp;
export function createTestApp({
  weather: weatherOption,
  repository,
}: TestAppOptions<FakeWeatherClient | 'msw'> = {}): TestApp {
  const config = loadConfig({
    WEATHERSTACK_KEY: TEST_WEATHERSTACK_KEY,
    DATABASE_URL: inject('databaseUrl'),
  });
  const { logger, lines } = captureLogs();
  const { db, close } = createDb(config.databaseUrl);
  const weather =
    weatherOption === 'msw'
      ? createWeatherstackClient({
          baseUrl: config.weatherstackBaseUrl,
          accessKey: config.weatherstackKey,
          logger,
        })
      : (weatherOption ?? new FakeWeatherClient());
  const { yoga } = createApp({
    config,
    logger,
    repository: repository ?? createPropertyRepository(db),
    weather,
  });

  async function execute(
    document: string,
    variables?: Record<string, unknown>,
  ): Promise<ExecuteResult> {
    const response = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: document, variables }),
    });
    const body: unknown = await response.json();
    if (!isExecuteResult(body)) throw new Error('execute: response is not a GraphQL result');
    return body;
  }

  return { db, weather, execute, logs: lines, close };
}
