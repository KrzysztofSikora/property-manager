import { afterEach, describe, expect, it, vi } from 'vitest';
import { weatherstackError, weatherstackResponse } from '../../../test/fixtures/weatherstack.ts';
import { captureLogs } from '../../../test/helpers/logs.ts';
import { expectNoSecret, TEST_WEATHERSTACK_KEY } from '../../../test/helpers/secrets.ts';
import { weatherstackHandlers } from '../../../test/msw/weatherstack.ts';
import { server } from '../../../test/setup/msw.ts';
import { WeatherQuotaExceededError, WeatherUnavailableError } from '../../domain/errors.ts';
import { createWeatherstackClient, DEFAULT_TIMEOUT_MS } from './client.ts';
import type { WeatherstackClientOptions } from './client.ts';

const BASE_URL = 'https://weatherstack.test';
const QUERY = '15528 E Golden Eagle Blvd, Fountain Hills, AZ 85268, United States';

function setup(options: Partial<WeatherstackClientOptions> = {}) {
  const logs = captureLogs();
  const client = createWeatherstackClient({
    baseUrl: BASE_URL,
    accessKey: TEST_WEATHERSTACK_KEY,
    logger: logs.logger,
    ...options,
  });
  return { client, logs: logs.lines };
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection');
}

async function unavailable(promise: Promise<unknown>): Promise<WeatherUnavailableError> {
  const error = await rejection(promise);
  if (error instanceof WeatherUnavailableError) return error;
  throw new Error('expected a WeatherUnavailableError', { cause: error });
}

function warnings(lines: Record<string, unknown>[]): Record<string, unknown>[] {
  return lines.filter((line) => line.level === 40);
}

function errors(lines: Record<string, unknown>[]): Record<string, unknown>[] {
  return lines.filter((line) => line.level === 50);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createWeatherstackClient', () => {
  it('TR-17 / FR-05 AC2: sends one GET /current with the query, units=f and the key', async () => {
    const { handler, requests } = weatherstackHandlers.ok();
    server.use(handler);
    const { client } = setup();

    await client.current(QUERY);

    expect(requests).toHaveLength(1);
    const [url] = requests;
    expect(url?.host).toBe('weatherstack.test');
    expect(url?.pathname).toBe('/current');
    expect(url?.searchParams.get('query')).toBe(QUERY);
    expect(url?.searchParams.get('units')).toBe('f');
    // A boolean, so a failure never prints the key.
    expect(url?.searchParams.get('access_key') === TEST_WEATHERSTACK_KEY).toBe(true);
  });

  it.each(['https://proxy.test/weatherstack/', 'https://proxy.test/weatherstack'])(
    'TR-17: keeps a path in the base URL %s',
    async (baseUrl) => {
      const { handler, requests } = weatherstackHandlers.ok();
      server.use(handler);
      const { client } = setup({ baseUrl });

      await client.current(QUERY);

      expect(requests[0]?.href).toMatch(/^https:\/\/proxy\.test\/weatherstack\/current\?/);
    },
  );

  it('returns the parsed report', async () => {
    server.use(weatherstackHandlers.ok().handler);
    const { client } = setup();

    await expect(client.current(QUERY)).resolves.toEqual({
      lat: 33.609,
      long: -111.729,
      region: 'Arizona',
      current: weatherstackResponse().current,
    });
  });

  it('sends the request with an abort signal (the timeout)', async () => {
    const signals: unknown[] = [];
    const { client } = setup({
      fetch: (_input, init) => {
        signals.push(init?.signal);
        return Promise.resolve(Response.json(weatherstackResponse()));
      },
    });

    await client.current(QUERY);

    expect(signals).toHaveLength(1);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
  });

  it.each([
    ['the default', {}, 5000],
    ['an injected timeoutMs', { timeoutMs: 50 }, 50],
  ])('TR-10: the timeout signal uses %s', async (_case, options, expected) => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    server.use(weatherstackHandlers.ok().handler);
    const { client } = setup(options);

    await client.current(QUERY);

    expect(timeout).toHaveBeenCalledExactlyOnceWith(expected);
    expect(DEFAULT_TIMEOUT_MS).toBe(5000);
  });

  it('FR-06 AC3 / TR-10: a hang is cut off by the timeout after one request, with no retry', async () => {
    const { handler, requests } = weatherstackHandlers.hang();
    server.use(handler);
    const { client, logs } = setup({ timeoutMs: 50 });

    const error = await unavailable(client.current(QUERY));

    expect(error.cause).toMatchObject({ error: { name: 'TimeoutError' } });
    expect(error.reason).toBe('upstream');
    expect(requests).toHaveLength(1);
    expect(warnings(logs())).toMatchObject([
      { msg: 'Weatherstack request failed', error: { name: 'TimeoutError' } },
    ]);
    expect(String(warnings(logs())[0]?.url)).toContain('access_key=[REDACTED]');
    expectNoSecret(error, logs());
  });

  // `cause` is what the error carries; `logged` is what the warning line adds next to the URL.
  it.each([
    [
      'HTTP 500',
      () => weatherstackHandlers.status(500, { message: 'boom' }),
      { status: 500 },
      { status: 500 },
    ],
    ['HTTP 404', () => weatherstackHandlers.status(404), { status: 404 }, { status: 404 }],
    ['HTTP 503', () => weatherstackHandlers.status(503), { status: 503 }, { status: 503 }],
    // A burst limit, not the monthly quota (body code 429): trying again later helps.
    [
      'HTTP 429',
      () => weatherstackHandlers.status(429, weatherstackError(429, 'too_many_requests')),
      { status: 429 },
      { status: 429 },
    ],
    [
      'a network error',
      () => weatherstackHandlers.networkError(),
      { error: { name: 'TypeError' } },
      { error: { name: 'TypeError' } },
    ],
    [
      'a body that is not JSON',
      () => weatherstackHandlers.text('<html>busy</html>'),
      { error: { name: 'SyntaxError' } },
      { error: { name: 'SyntaxError' } },
    ],
    [
      'a missing key field',
      () => weatherstackHandlers.ok(weatherstackResponse({ current: { temperature: undefined } })),
      { issues: ['current.temperature'] },
      { cause: { issues: ['current.temperature'] } },
    ],
  ])(
    'TR-01: %s gives WeatherUnavailableError after one request, with its cause and no key leaked',
    async (_case, make, cause, logged) => {
      const { handler, requests } = make();
      server.use(handler);
      const { client, logs } = setup();

      const error = await unavailable(client.current(QUERY));

      expect(error.cause).toMatchObject(cause);
      expect(error.reason).toBe('upstream');
      expect(requests).toHaveLength(1);
      expect(errors(logs())).toEqual([]);
      expect(warnings(logs())).toHaveLength(1);
      expect(warnings(logs())[0]).toMatchObject(logged);
      expect(warnings(logs())[0]?.url).toContain('access_key=[REDACTED]');
      expectNoSecret(error, logs());
    },
  );

  it('an error status without a body gives WeatherUnavailableError with the status as cause', async () => {
    const { client, logs } = setup({
      fetch: () => Promise.resolve(new Response(null, { status: 503 })),
    });

    const error = await unavailable(client.current(QUERY));

    expect(error.cause).toEqual({ status: 503 });
    expect(warnings(logs())).toMatchObject([{ status: 503 }]);
  });

  it('a thrown non-Error value gives WeatherUnavailableError', async () => {
    const { client } = setup({
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the case under test
      fetch: () => Promise.reject('offline'),
    });

    const error = await unavailable(client.current(QUERY));

    expect(error.cause).toMatchObject({ error: { name: 'UnknownError' } });
  });

  it('TR-01: a fetch error quoting the URL is redacted in the error and the logs', async () => {
    const { client, logs } = setup({
      fetch: (input) => {
        const url = input instanceof Request ? input.url : input.toString();
        return Promise.reject(new TypeError(`fetch failed: ${url}`, { cause: url }));
      },
    });

    const error = await unavailable(client.current(QUERY));

    // The redacted message is kept, so the cause and the log still say what failed.
    const redactedMessage = /"message":"fetch failed: [^"]*access_key=\[REDACTED\]/;
    expect(error.cause).toMatchObject({ error: { name: 'TypeError' } });
    expect(JSON.stringify(error.cause)).toMatch(redactedMessage);
    expect(warnings(logs())).toHaveLength(1);
    expect(JSON.stringify(warnings(logs()))).toMatch(redactedMessage);
    expectNoSecret(error, logs());
  });

  // FR-06 AC1, AC2, AC6: one log line per rejected body, its level set by the class.
  it.each([
    [104, 'usage_limit_reached', 'WEATHER_QUOTA_EXCEEDED', 50, 'Weatherstack usage limit reached'],
    [429, 'too_many_requests', 'WEATHER_QUOTA_EXCEEDED', 50, 'Weatherstack usage limit reached'],
    [101, 'unauthorized', 'WEATHER_UNAVAILABLE', 50, 'Weatherstack configuration error'],
    [105, 'https_access_restricted', 'WEATHER_UNAVAILABLE', 50, 'Weatherstack configuration error'],
    [403, 'forbidden', 'WEATHER_UNAVAILABLE', 50, 'Weatherstack configuration error'],
    [615, 'request_failed', 'WEATHER_UNAVAILABLE', 40, 'Weatherstack response rejected'],
    [999, 'unknown', 'WEATHER_UNAVAILABLE', 40, 'Weatherstack response rejected'],
  ])(
    'TR-02: body code %d (%s) gives %s after one request and one level-%d log line "%s"',
    async (code, type, errorCode, level, msg) => {
      const { handler, requests } = weatherstackHandlers.ok(weatherstackError(code, type));
      server.use(handler);
      const { client, logs } = setup();

      const error = await rejection(client.current(QUERY));

      expect(error).toBeInstanceOf(
        errorCode === 'WEATHER_QUOTA_EXCEEDED'
          ? WeatherQuotaExceededError
          : WeatherUnavailableError,
      );
      expect(error).toMatchObject({
        code: errorCode,
        cause: { weatherstackError: { code, type } },
      });
      expect(requests).toHaveLength(1);
      const logged = logs().filter((line) => Number(line.level) >= 40);
      expect(logged).toHaveLength(1);
      expect(logged[0]).toMatchObject({ level, msg, cause: { weatherstackError: { code, type } } });
      expect(String(logged[0]?.url)).toContain('access_key=[REDACTED]');
      expectNoSecret(error, logs());
    },
  );

  it.each([
    [101, 'configuration'],
    [615, 'upstream'],
  ])('FR-06 AC6: body code %d is unavailable with reason %s', async (code, reason) => {
    server.use(weatherstackHandlers.ok(weatherstackError(code, 'any')).handler);
    const { client } = setup();

    const error = await unavailable(client.current(QUERY));

    expect(error.reason).toBe(reason);
  });

  it('FR-06 AC7 / TR-01: a key quoted in the error body info is neither thrown nor logged', async () => {
    server.use(
      weatherstackHandlers.ok(
        weatherstackError(
          101,
          'invalid_access_key',
          `You have not supplied a valid API Access Key: ${TEST_WEATHERSTACK_KEY}`,
        ),
      ).handler,
    );
    const { client, logs } = setup();

    const error = await unavailable(client.current(QUERY));

    // The code and type are kept next to the dropped `info`.
    expect(error.cause).toEqual({ weatherstackError: { code: 101, type: 'invalid_access_key' } });
    expect(errors(logs())).toMatchObject([
      { cause: { weatherstackError: { code: 101, type: 'invalid_access_key' } } },
    ]);
    expectNoSecret(error, logs());
  });
});
