import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  WEATHERSTACK_SAMPLE_PATH,
  weatherstackError,
  weatherstackResponse,
} from './weatherstack.ts';

const sample: unknown = JSON.parse(readFileSync(WEATHERSTACK_SAMPLE_PATH, 'utf8'));

describe('weatherstackResponse', () => {
  it('reads docs/samples/weatherstack-current.json', () => {
    expect(WEATHERSTACK_SAMPLE_PATH).toMatch(/docs\/samples\/weatherstack-current\.json$/);
  });

  it('deep-equals the recorded sample without overrides', () => {
    expect(weatherstackResponse()).toEqual(sample);
    expect(weatherstackResponse()).toHaveProperty('location.region', 'Arizona');
  });

  it('TR-03: changes only the overridden path', () => {
    const body = weatherstackResponse({ location: { region: 'Nevada' } });
    const { location: expectedLocation, ...expectedRest } = weatherstackResponse();
    const { location, ...rest } = body;

    if (
      typeof expectedLocation !== 'object' ||
      expectedLocation === null ||
      Array.isArray(expectedLocation)
    ) {
      throw new Error('sample has no location object');
    }
    expect(location).toEqual({ ...expectedLocation, region: 'Nevada' });
    expect(rest).toEqual(expectedRest);
  });

  it('TR-03: removes a key whose override is undefined', () => {
    const body = weatherstackResponse({ current: undefined, location: { lat: undefined } });

    expect(body).not.toHaveProperty('current');
    expect(body).not.toHaveProperty('location.lat');
    expect(body).toHaveProperty('location.lon', '-111.729');
  });

  it('replaces arrays and scalars instead of merging them', () => {
    const body = weatherstackResponse({
      current: { weather_descriptions: ['Sunny'], temperature: 100 },
    });

    expect(body).toHaveProperty('current.weather_descriptions', ['Sunny']);
    expect(body).toHaveProperty('current.temperature', 100);
    expect(body).toHaveProperty('current.humidity', 34);
  });

  it('replaces a scalar with an object, dropping undefined inside it', () => {
    const body = weatherstackResponse({ request: { unit: { a: 1, b: undefined } } });

    expect(body).toHaveProperty('request.unit', { a: 1 });
  });

  it('returns a fresh copy on every call', () => {
    const first = weatherstackResponse();
    first.success = false;
    const nested = first.location;
    if (typeof nested === 'object' && nested !== null && !Array.isArray(nested)) {
      nested.region = 'Changed';
    }

    expect(weatherstackResponse()).toEqual(sample);
  });
});

describe('weatherstackError', () => {
  it('builds a success: false body with the code and type', () => {
    const body = weatherstackError(104, 'usage_limit_reached');

    expect(body).toHaveProperty('success', false);
    expect(body).toHaveProperty('error.code', 104);
    expect(body).toHaveProperty('error.type', 'usage_limit_reached');
    expect(body).toHaveProperty('error.info');
  });

  it('uses the given info text', () => {
    expect(weatherstackError(615, 'request_failed', 'Your API request failed.')).toHaveProperty(
      'error.info',
      'Your API request failed.',
    );
  });
});
