import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { weatherstackResponse } from '../../test/fixtures/weatherstack.ts';
import { toCurrentWeather } from './weather.ts';

const KEY_FIELDS = [
  'temperature',
  'feelslike',
  'weather_descriptions',
  'weather_icons',
  'wind_speed',
  'wind_dir',
  'humidity',
] as const;

function sampleCurrent(): unknown {
  return weatherstackResponse().current;
}

describe('toCurrentWeather', () => {
  it('TR-16: maps the sample key fields to camelCase', () => {
    expect(toCurrentWeather(sampleCurrent())).toMatchObject({
      temperature: 82,
      feelsLike: 79,
      weatherDescriptions: ['Clear '],
      weatherIcons: [
        'https://cdn.worldweatheronline.com/images/wsymbols01_png_64/wsymbol_0008_clear_sky_night.png',
      ],
      windSpeed: 6,
      windDir: 'NE',
      humidity: 34,
    });
  });

  it('TR-16: raw deep-equals the response current, non-key fields included', () => {
    const { raw } = toCurrentWeather(sampleCurrent());

    expect(raw).toEqual(sampleCurrent());
    expect(raw).toHaveProperty('astro.moon_phase', 'Waning Crescent');
    expect(raw).toHaveProperty(['air_quality', 'us-epa-index'], '1');
  });

  it.each(KEY_FIELDS)('TR-03: fails without the key field %s', (field) => {
    const current = weatherstackResponse({ current: { [field]: undefined } }).current;

    expect(() => toCurrentWeather(current)).toThrow(ZodError);
  });

  it.each([
    ['temperature', '82'],
    ['humidity', 34.5],
    ['weather_descriptions', 'Clear'],
    ['wind_dir', 1],
  ])('TR-03: fails when %s has the wrong type', (field, value) => {
    const current = weatherstackResponse({ current: { [field]: value } }).current;

    expect(() => toCurrentWeather(current)).toThrow(ZodError);
  });

  it('TR-03: parses without astro, air_quality and other non-key fields', () => {
    const current = weatherstackResponse({
      current: {
        astro: undefined,
        air_quality: undefined,
        pressure: undefined,
        uv_index: undefined,
      },
    }).current;

    expect(toCurrentWeather(current).temperature).toBe(82);
  });

  it.each([null, 'current', []])('fails when current is %j', (value) => {
    expect(() => toCurrentWeather(value)).toThrow(ZodError);
  });
});
