import { inject } from 'vitest';
import { createApp } from '../../src/app.ts';
import { loadConfig } from '../../src/config/env.ts';
import { createDb } from '../../src/db/client.ts';
import type { Database } from '../../src/db/client.ts';
import { captureLogs } from './logs.ts';
import type { LogLine } from './logs.ts';
import { TEST_WEATHERSTACK_KEY } from './secrets.ts';

export type ExecuteResult = { data?: unknown; errors?: unknown[] };

export type TestApp = {
  db: Database;
  execute: (document: string, variables?: Record<string, unknown>) => Promise<ExecuteResult>;
  logs: () => LogLine[];
  close: () => Promise<void>;
};

function isExecuteResult(value: unknown): value is ExecuteResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    (!('errors' in value) || Array.isArray(value.errors))
  );
}

// The real composition root against the Testcontainers database, with the sentinel key and a
// captured logger. S-01 adds the `weather` option and passes `db` into `createApp`.
export function createTestApp(): TestApp {
  const config = loadConfig({
    WEATHERSTACK_KEY: TEST_WEATHERSTACK_KEY,
    DATABASE_URL: inject('databaseUrl'),
  });
  const { logger, lines } = captureLogs();
  const { db, close } = createDb(config.databaseUrl);
  const { yoga } = createApp({ config, logger });

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

  return { db, execute, logs: lines, close };
}
