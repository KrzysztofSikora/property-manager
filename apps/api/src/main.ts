import { createServer } from 'node:http';
import { createWeatherstackClient } from './adapters/weatherstack/client.ts';
import { createApp } from './app.ts';
import { ConfigError, loadConfig } from './config/env.ts';
import type { Config } from './config/env.ts';
import { createDb } from './db/client.ts';
import { createLogger } from './logger.ts';
import { createPropertyRepository } from './repositories/property.repository.ts';

function readConfig(): Config {
  try {
    return loadConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
}

const config = readConfig();
const logger = createLogger(config.logLevel);
// The pool connects on first use, so a missing database shows up per request, not at start.
const { db, close: closeDb } = createDb(config.databaseUrl);
const { yoga } = createApp({
  config,
  logger,
  repository: createPropertyRepository(db),
  weather: (requestLogger) =>
    createWeatherstackClient({
      baseUrl: config.weatherstackBaseUrl,
      accessKey: config.weatherstackKey,
      logger: requestLogger,
    }),
});
const server = createServer((request, response) => {
  // Yoga handles its own errors, so the returned promise is not awaited.
  void yoga(request, response);
});

server.listen(config.port, () => {
  logger.info({ port: config.port }, 'listening');
});

function shutdown(signal: NodeJS.Signals): void {
  logger.info({ signal }, 'shutting down');
  server.close(() => {
    void closeDb().finally(() => {
      process.exit(0);
    });
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
