import { describe, expect, it } from 'vitest';
import { weatherstackError, weatherstackResponse } from '../../../test/fixtures/weatherstack.ts';
import { WeatherQuotaExceededError, WeatherUnavailableError } from '../../domain/errors.ts';
import { classifyWeatherstackError, parseWeatherstackResponse } from './response.ts';

describe('classifyWeatherstackError', () => {
  it.each([
    [104, 'quota'],
    [429, 'quota'],
    [101, 'configuration'],
    [105, 'configuration'],
    [403, 'configuration'],
    [615, 'upstream'],
    [404, 'upstream'],
    [0, 'upstream'],
    [undefined, 'upstream'],
  ])('TR-02: code %s is %s', (code, expected) => {
    expect(classifyWeatherstackError(code)).toBe(expected);
  });
});

describe('parseWeatherstackResponse', () => {
  it('TR-03: parses the recorded sample (contract)', () => {
    const body = weatherstackResponse();

    expect(parseWeatherstackResponse(body)).toEqual({
      lat: 33.609,
      long: -111.729,
      region: 'Arizona',
      current: body.current,
    });
  });

  it('TR-03: parses without astro and air_quality', () => {
    const body = weatherstackResponse({ current: { astro: undefined, air_quality: undefined } });

    expect(parseWeatherstackResponse(body).current).not.toHaveProperty('astro');
  });

  it.each(['temperature', 'weather_descriptions', 'humidity'])(
    'TR-03: a missing key field (%s) is unavailable',
    (field) => {
      const body = weatherstackResponse({ current: { [field]: undefined } });

      const error = catchError(() => parseWeatherstackResponse(body));

      expect(error.cause).toEqual({ issues: [`current.${field}`] });
      expect(error.reason).toBe('upstream');
    },
  );

  it.each([
    ['lat not numeric', { location: { lat: 'north' } }, 'location.lat'],
    ['lat empty', { location: { lat: '' } }, 'location.lat'],
    ['lat a number', { location: { lat: 33.609 } }, 'location.lat'],
    ['lat with a leading letter', { location: { lat: 'N33.6' } }, 'location.lat'],
    ['lat with a trailing letter', { location: { lat: '33.6N' } }, 'location.lat'],
    ['lon missing', { location: { lon: undefined } }, 'location.lon'],
    ['region empty', { location: { region: '' } }, 'location.region'],
    ['region missing', { location: { region: undefined } }, 'location.region'],
    ['location missing', { location: undefined }, 'location'],
    ['current missing', { current: undefined }, 'current'],
  ])('TR-03: %s is unavailable, naming the path', (_case, overrides, path) => {
    const error = catchError(() => parseWeatherstackResponse(weatherstackResponse(overrides)));

    expect(error.cause).toEqual({ issues: [path] });
    expect(error.reason).toBe('upstream');
  });

  it.each([
    ['33', 33],
    ['-0.5', -0.5],
    ['999', 999],
  ])('parses lat %s as %d (range is the database CHECK)', (lat, expected) => {
    expect(parseWeatherstackResponse(weatherstackResponse({ location: { lat } })).lat).toBe(
      expected,
    );
  });

  // FR-06 AC1, AC2, AC6. The cause keeps the code and type, never `info`.
  it.each([
    [104, 'usage_limit_reached', WeatherQuotaExceededError, { code: 'WEATHER_QUOTA_EXCEEDED' }],
    [429, 'too_many_requests', WeatherQuotaExceededError, { code: 'WEATHER_QUOTA_EXCEEDED' }],
    [
      101,
      'unauthorized',
      WeatherUnavailableError,
      { code: 'WEATHER_UNAVAILABLE', reason: 'configuration' },
    ],
    [
      105,
      'https_access_restricted',
      WeatherUnavailableError,
      { code: 'WEATHER_UNAVAILABLE', reason: 'configuration' },
    ],
    [
      403,
      'forbidden',
      WeatherUnavailableError,
      { code: 'WEATHER_UNAVAILABLE', reason: 'configuration' },
    ],
    [
      615,
      'request_failed',
      WeatherUnavailableError,
      { code: 'WEATHER_UNAVAILABLE', reason: 'upstream' },
    ],
    [999, 'unknown', WeatherUnavailableError, { code: 'WEATHER_UNAVAILABLE', reason: 'upstream' }],
  ])(
    'TR-02: a success: false body with code %d (%s) throws %o',
    (code, type, errorClass, fields) => {
      const error = thrown(() =>
        parseWeatherstackResponse(weatherstackError(code, type, 'Info text, never kept.')),
      );

      expect(error).toBeInstanceOf(errorClass);
      expect(error).toMatchObject(fields);
      // Equality, not a subset match: an `info` key in the cause fails here.
      expect(error).toHaveProperty('cause', { weatherstackError: { code, type } });
    },
  );

  it('TR-02: a success: false body without an error is unavailable (upstream), with an empty cause', () => {
    const error = catchError(() => parseWeatherstackResponse({ success: false }));

    expect(error.cause).toEqual({ weatherstackError: {} });
    expect(error.reason).toBe('upstream');
  });

  // A non-object body fails at the root, whose path is empty.
  it.each([null, 'ok', []])('a body of %j is unavailable', (body) => {
    const error = catchError(() => parseWeatherstackResponse(body));

    expect(error.cause).toEqual({ issues: [''] });
  });

  it('the error cause names the failing paths, not the body', () => {
    const body = weatherstackResponse({
      location: { lat: 'SECRET_BODY_VALUE' },
      current: { humidity: undefined },
    });

    const error = catchError(() => parseWeatherstackResponse(body));

    expect(error.cause).toEqual({ issues: ['location.lat', 'current.humidity'] });
    expect(JSON.stringify(error.cause)).not.toContain('SECRET_BODY_VALUE');
  });
});

function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('expected a throw');
}

function catchError(fn: () => unknown): WeatherUnavailableError {
  try {
    fn();
  } catch (error) {
    if (error instanceof WeatherUnavailableError) return error;
    throw error;
  }
  throw new Error('expected a WeatherUnavailableError');
}
