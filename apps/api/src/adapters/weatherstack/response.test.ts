import { describe, expect, it } from 'vitest';
import { weatherstackError, weatherstackResponse } from '../../../test/fixtures/weatherstack.ts';
import { WeatherUnavailableError } from '../../domain/errors.ts';
import { parseWeatherstackResponse } from './response.ts';

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

      expect(() => parseWeatherstackResponse(body)).toThrow(WeatherUnavailableError);
    },
  );

  it.each([
    ['lat not numeric', { location: { lat: 'north' } }],
    ['lat empty', { location: { lat: '' } }],
    ['lat a number', { location: { lat: 33.609 } }],
    ['lat with a leading letter', { location: { lat: 'N33.6' } }],
    ['lat with a trailing letter', { location: { lat: '33.6N' } }],
    ['lon missing', { location: { lon: undefined } }],
    ['region empty', { location: { region: '' } }],
    ['region missing', { location: { region: undefined } }],
    ['location missing', { location: undefined }],
    ['current missing', { current: undefined }],
  ])('TR-03: %s is unavailable', (_case, overrides) => {
    expect(() => parseWeatherstackResponse(weatherstackResponse(overrides))).toThrow(
      WeatherUnavailableError,
    );
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

  it.each([
    [
      'with an error',
      weatherstackError(615, 'request_failed'),
      { code: 615, type: 'request_failed' },
    ],
    ['without an error', { success: false }, {}],
  ])('a success: false body %s is unavailable, with the code as cause', (_case, body, expected) => {
    const error = catchError(() => parseWeatherstackResponse(body));

    expect(error.cause).toEqual({ weatherstackError: expected });
  });

  it.each([null, 'ok', []])('a body of %j is unavailable', (body) => {
    expect(() => parseWeatherstackResponse(body)).toThrow(WeatherUnavailableError);
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

function catchError(fn: () => unknown): WeatherUnavailableError {
  try {
    fn();
  } catch (error) {
    if (error instanceof WeatherUnavailableError) return error;
    throw error;
  }
  throw new Error('expected a WeatherUnavailableError');
}
