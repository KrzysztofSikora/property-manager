import { createServer } from 'node:http';
import { createApp } from './app.ts';
import { ConfigError, loadConfig } from './config/env.ts';
import type { Config } from './config/env.ts';
import { createLogger } from './logger.ts';

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
const { yoga } = createApp({ config, logger });
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
    process.exit(0);
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
