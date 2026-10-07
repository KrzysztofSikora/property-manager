import { http, HttpResponse } from 'msw/http';
import { describe, expect, it } from 'vitest';
import { weatherstackError, weatherstackResponse } from '../../../test/fixtures/weatherstack.ts';
import { captureLogs } from '../../../test/helpers/logs.ts';
import { expectNoSecret, TEST_WEATHERSTACK_KEY } from '../../../test/helpers/secrets.ts';
import { weatherstackHandlers } from '../../../test/msw/weatherstack.ts';
import { server } from '../../../test/setup/msw.ts';
import { WeatherUnavailableError } from '../../domain/errors.ts';
import { createWeatherstackClient } from './client.ts';
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

  it('TR-17: keeps a path in the base URL', async () => {
    const { handler, requests } = weatherstackHandlers.ok();
    server.use(handler);
    const { client } = setup({ baseUrl: 'https://proxy.test/weatherstack/' });

    await client.current(QUERY);

    expect(requests[0]?.href).toMatch(/^https:\/\/proxy\.test\/weatherstack\/current\?/);
  });

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
    ['HTTP 500', () => weatherstackHandlers.status(500, { message: 'boom' })],
    ['HTTP 404', () => weatherstackHandlers.status(404)],
    ['a network error', () => weatherstackHandlers.networkError()],
    ['success: false', () => weatherstackHandlers.ok(weatherstackError(615, 'request_failed'))],
    [
      'a missing key field',
      () => weatherstackHandlers.ok(weatherstackResponse({ current: { temperature: undefined } })),
    ],
  ])(
    'TR-01: %s gives WeatherUnavailableError after one request, with no key leaked',
    async (_case, make) => {
      const { handler, requests } = make();
      server.use(handler);
      const { client, logs } = setup();

      const error = await rejection(client.current(QUERY));

      expect(error).toBeInstanceOf(WeatherUnavailableError);
      expect(requests).toHaveLength(1);
      const warnings = logs().filter((line) => line.level === 40);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]?.url).toContain('access_key=[REDACTED]');
      expectNoSecret(error, logs());
    },
  );

  it('a body that is not JSON gives WeatherUnavailableError', async () => {
    server.use(http.get('*/current', () => HttpResponse.text('<html>busy</html>')));
    const { client, logs } = setup();

    await expect(client.current(QUERY)).rejects.toThrow(WeatherUnavailableError);
    expectNoSecret(logs());
  });

  it('TR-01: a fetch error quoting the URL is redacted in the error and the logs', async () => {
    const { client, logs } = setup({
      fetch: (input) => {
        const url = input instanceof Request ? input.url : input.toString();
        return Promise.reject(new TypeError(`fetch failed: ${url}`, { cause: url }));
      },
    });

    const error = await rejection(client.current(QUERY));

    expect(error).toBeInstanceOf(WeatherUnavailableError);
    expect(JSON.stringify(logs())).toContain('access_key=[REDACTED]');
    expectNoSecret(error, logs());
  });
});
