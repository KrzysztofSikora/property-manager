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

      const error = catchError(() => parseWeatherstackResponse(body));

      expect(error.cause).toEqual({ issues: [`current.${field}`] });
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

function catchError(fn: () => unknown): WeatherUnavailableError {
  try {
    fn();
  } catch (error) {
    if (error instanceof WeatherUnavailableError) return error;
    throw error;
  }
  throw new Error('expected a WeatherUnavailableError');
}
