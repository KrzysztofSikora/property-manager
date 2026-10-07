import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './env.ts';

const KEY = 'TEST_WEATHERSTACK_KEY';

function errorOf(env: Record<string, string | undefined>): ConfigError {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) return error;
    throw error;
  }
  throw new Error('expected loadConfig to throw');
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
    ['LOG_LEVEL', 'loud'],
    ['WEATHERSTACK_BASE_URL', 'not a url'],
    ['DATABASE_URL', 'nope'],
  ])('TR-18: an invalid %s (%s) is named without echoing the key', (name, value) => {
    const message = errorOf({ WEATHERSTACK_KEY: KEY, [name]: value }).message;
    expect(message).toContain(`Invalid environment variable: ${name}`);
    expect(message).not.toContain(KEY);
  });

  it('lists every bad variable', () => {
    const message = errorOf({ PORT: 'abc' }).message;
    expect(message).toContain('WEATHERSTACK_KEY');
    expect(message).toContain('PORT');
  });
});
