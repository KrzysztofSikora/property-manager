import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, loadDatabaseConfig, loadSeedConfig } from './env.ts';

const KEY = 'TEST_WEATHERSTACK_KEY';

function errorOf(
  env: Record<string, string | undefined>,
  load: (env: Record<string, string | undefined>) => unknown = loadConfig,
): ConfigError {
  try {
    load(env);
  } catch (error) {
    if (error instanceof ConfigError) return error;
    throw error;
  }
  throw new Error('expected the config loader to throw');
}

describe('loadConfig', () => {
  it('FR-14 AC3: a missing key names WEATHERSTACK_KEY', () => {
    expect(errorOf({}).message).toContain(
      'Missing required environment variable: WEATHERSTACK_KEY',
    );
  });

  it('FR-14 AC3: an empty key counts as missing', () => {
    expect(errorOf({ WEATHERSTACK_KEY: '' }).message).toContain(
      'Missing required environment variable: WEATHERSTACK_KEY',
    );
  });

  it('TR-18: applies the defaults when only the key is set', () => {
    expect(loadConfig({ WEATHERSTACK_KEY: KEY })).toEqual({
      weatherstackKey: KEY,
      weatherstackBaseUrl: 'https://api.weatherstack.com',
      databaseUrl: 'postgres://postgres:postgres@localhost:5432/property_manager',
      port: 4000,
      logLevel: 'info',
    });
  });

  it('TR-18: empty optional values fall back to the defaults', () => {
    const config = loadConfig({
      WEATHERSTACK_KEY: KEY,
      WEATHERSTACK_BASE_URL: '',
      DATABASE_URL: '',
      PORT: '',
      LOG_LEVEL: '',
    });
    expect(config.weatherstackBaseUrl).toBe('https://api.weatherstack.com');
    expect(config.port).toBe(4000);
    expect(config.logLevel).toBe('info');
  });

  it('reads explicit values', () => {
    const config = loadConfig({
      WEATHERSTACK_KEY: KEY,
      WEATHERSTACK_BASE_URL: 'http://localhost:9999',
      DATABASE_URL: 'postgres://u:p@db:5432/x',
      PORT: '8080',
      LOG_LEVEL: 'debug',
    });
    expect(config).toMatchObject({
      weatherstackBaseUrl: 'http://localhost:9999',
      databaseUrl: 'postgres://u:p@db:5432/x',
      port: 8080,
      logLevel: 'debug',
    });
  });

  it.each([
    ['PORT', 'abc'],
    ['PORT', '0'],
    ['PORT', '65536'],
    ['PORT', '80.5'],
    ['PORT', '8e3'],
    ['PORT', '+80'],
    ['LOG_LEVEL', 'loud'],
    ['WEATHERSTACK_BASE_URL', 'not a url'],
    ['DATABASE_URL', 'nope'],
  ])('TR-18: an invalid %s (%s) is named without echoing the key', (name, value) => {
    const message = errorOf({ WEATHERSTACK_KEY: KEY, [name]: value }).message;
    expect(message).toContain(`Invalid environment variable: ${name}`);
    expect(message).not.toContain(KEY);
  });

  it('ignores SEED_API_URL, even an invalid one', () => {
    expect(loadConfig({ WEATHERSTACK_KEY: KEY, SEED_API_URL: 'not a url' })).not.toHaveProperty(
      'apiUrl',
    );
  });

  it('lists every bad variable, one per line', () => {
    expect(errorOf({ PORT: 'abc' }).message.split('\n')).toEqual([
      'Missing required environment variable: WEATHERSTACK_KEY',
      'Invalid environment variable: PORT (expected an integer from 1 to 65535)',
    ]);
  });
});

describe('loadDatabaseConfig', () => {
  it('does not need WEATHERSTACK_KEY', () => {
    expect(loadDatabaseConfig({ DATABASE_URL: 'postgres://u:p@db:5432/x' })).toEqual({
      databaseUrl: 'postgres://u:p@db:5432/x',
    });
  });

  it.each([
    ['unset', undefined],
    ['empty', ''],
  ])('uses the default when DATABASE_URL is %s', (_label, value) => {
    expect(loadDatabaseConfig({ DATABASE_URL: value })).toEqual({
      databaseUrl: 'postgres://postgres:postgres@localhost:5432/property_manager',
    });
  });

  it('names DATABASE_URL without echoing an invalid value', () => {
    const error = errorOf({ DATABASE_URL: 'not-a-url' }, loadDatabaseConfig);
    expect(error.message).toBe('Invalid environment variable: DATABASE_URL (expected a URL)');
  });
});

describe('loadSeedConfig', () => {
  it.each([
    ['unset', undefined],
    ['empty', ''],
  ])('FR-16: uses the local API when SEED_API_URL is %s', (_label, value) => {
    expect(loadSeedConfig({ SEED_API_URL: value })).toEqual({
      apiUrl: 'http://localhost:4000/graphql',
    });
  });

  it('FR-16: reads an explicit SEED_API_URL without needing WEATHERSTACK_KEY', () => {
    expect(loadSeedConfig({ SEED_API_URL: 'http://api.example:8080/graphql' })).toEqual({
      apiUrl: 'http://api.example:8080/graphql',
    });
  });

  it('FR-16: names SEED_API_URL without echoing an invalid value', () => {
    const error = errorOf({ SEED_API_URL: 'not-a-url', DATABASE_URL: 'nope' }, loadSeedConfig);
    expect(error.message).toBe('Invalid environment variable: SEED_API_URL (expected a URL)');
  });
});
