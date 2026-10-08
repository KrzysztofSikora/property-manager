import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { SAMPLE_OPTIONAL_WEATHER, weatherstackResponse } from '../../test/fixtures/weatherstack.ts';
import type { JsonOverrides } from '../../test/fixtures/weatherstack.ts';
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

const SAMPLE_KEY_FIELDS = {
  temperature: 82,
  feelsLike: 79,
  weatherDescriptions: ['Clear '],
  weatherIcons: [
    'https://cdn.worldweatheronline.com/images/wsymbols01_png_64/wsymbol_0008_clear_sky_night.png',
  ],
  windSpeed: 6,
  windDir: 'NE',
  humidity: 34,
};

// One optional field missing or mistyped at a time, all others valid. `path` is where the
// domain holds it.
const OPTIONAL_FIELD_CASES: [string, JsonOverrides, string[]][] = [
  ['observation_time missing', { observation_time: undefined }, ['observationTime']],
  ['observation_time a number', { observation_time: 1313 }, ['observationTime']],
  ['weather_code a string', { weather_code: '113' }, ['weatherCode']],
  ['wind_degree a fraction', { wind_degree: 48.5 }, ['windDegree']],
  ['pressure a string', { pressure: '1010' }, ['pressure']],
  ['pressure null', { pressure: null }, ['pressure']],
  ['precip a string', { precip: '0' }, ['precip']],
  ['cloudcover missing', { cloudcover: undefined }, ['cloudCover']],
  ['uv_index a fraction', { uv_index: 0.5 }, ['uvIndex']],
  ['visibility a string', { visibility: '6' }, ['visibility']],
  ['is_day missing', { is_day: undefined }, ['isDay']],
  ['is_day a boolean', { is_day: true }, ['isDay']],
  ['is_day "maybe"', { is_day: 'maybe' }, ['isDay']],
  ['astro.sunrise a number', { astro: { sunrise: 625 } }, ['astro', 'sunrise']],
  ['astro.sunset missing', { astro: { sunset: undefined } }, ['astro', 'sunset']],
  ['astro.moonrise null', { astro: { moonrise: null } }, ['astro', 'moonrise']],
  ['astro.moonset a number', { astro: { moonset: 427 } }, ['astro', 'moonset']],
  ['astro.moon_phase a number', { astro: { moon_phase: 3 } }, ['astro', 'moonPhase']],
  [
    'astro.moon_illumination a string',
    { astro: { moon_illumination: '15' } },
    ['astro', 'moonIllumination'],
  ],
  ['air_quality.co a number', { air_quality: { co: 112 } }, ['airQuality', 'co']],
  ['air_quality.no2 missing', { air_quality: { no2: undefined } }, ['airQuality', 'no2']],
  ['air_quality.o3 ""', { air_quality: { o3: '' } }, ['airQuality', 'o3']],
  ['air_quality.so2 "x"', { air_quality: { so2: 'x' } }, ['airQuality', 'so2']],
  ['air_quality.pm2_5 "4.6.1"', { air_quality: { pm2_5: '4.6.1' } }, ['airQuality', 'pm2_5']],
  ['air_quality.pm10 " 10.4"', { air_quality: { pm10: ' 10.4' } }, ['airQuality', 'pm10']],
  [
    'air_quality.us-epa-index "1.5"',
    { air_quality: { 'us-epa-index': '1.5' } },
    ['airQuality', 'usEpaIndex'],
  ],
  [
    'air_quality.us-epa-index ""',
    { air_quality: { 'us-epa-index': '' } },
    ['airQuality', 'usEpaIndex'],
  ],
  [
    'air_quality.us-epa-index "x"',
    { air_quality: { 'us-epa-index': 'x' } },
    ['airQuality', 'usEpaIndex'],
  ],
  [
    'air_quality.us-epa-index "1x"',
    { air_quality: { 'us-epa-index': '1x' } },
    ['airQuality', 'usEpaIndex'],
  ],
  [
    'air_quality.us-epa-index "x1"',
    { air_quality: { 'us-epa-index': 'x1' } },
    ['airQuality', 'usEpaIndex'],
  ],
  [
    'air_quality.gb-defra-index a number',
    { air_quality: { 'gb-defra-index': 1 } },
    ['airQuality', 'gbDefraIndex'],
  ],
];

function withoutPath(value: Record<string, unknown>, path: string[]): Record<string, unknown> {
  const [head, ...rest] = path;
  if (head === undefined) return value;
  const { [head]: inner, ...others } = value;
  if (rest.length === 0) return others;
  return { ...others, [head]: withoutPath(inner as Record<string, unknown>, rest) };
}

describe('toCurrentWeather optional fields', () => {
  it('TR-16: maps the sample to the key and optional typed fields and nothing else', () => {
    const { raw, ...typed } = toCurrentWeather(sampleCurrent());

    expect(typed).toEqual({ ...SAMPLE_KEY_FIELDS, ...SAMPLE_OPTIONAL_WEATHER });
    expect(raw).toEqual(sampleCurrent());
  });

  it('TR-16: maps is_day "yes" to true', () => {
    const current = weatherstackResponse({ current: { is_day: 'yes' } }).current;

    expect(toCurrentWeather(current).isDay).toBe(true);
  });

  it('TR-16: parses negative and whole decimal strings in air_quality', () => {
    const current = weatherstackResponse({
      current: { air_quality: { co: '-1.25', no2: '7' } },
    }).current;

    expect(toCurrentWeather(current).airQuality).toMatchObject({ co: -1.25, no2: 7 });
  });

  it.each(OPTIONAL_FIELD_CASES)('TR-16: %s drops only that field', (_name, overrides, path) => {
    const current = weatherstackResponse({ current: overrides }).current;

    expect(toCurrentWeather(current)).toEqual({
      ...withoutPath({ ...SAMPLE_KEY_FIELDS, ...SAMPLE_OPTIONAL_WEATHER }, path),
      raw: current,
    });
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['a string', 'none'],
    ['an array', []],
    ['empty', {}],
    ['all mistyped', { sunrise: 1, sunset: 1, moonrise: 1, moonset: 1, moon_phase: 1 }],
  ])('TR-16: astro %s gives undefined', (_name, astro) => {
    const current = { ...(sampleCurrent() as Record<string, unknown>), astro };

    expect(toCurrentWeather(current).astro).toBeUndefined();
    expect(toCurrentWeather(current).airQuality).toEqual(SAMPLE_OPTIONAL_WEATHER.airQuality);
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['a number', 1],
    ['an array', ['1']],
    ['empty', {}],
    ['all mistyped', { co: 1, 'us-epa-index': 1 }],
  ])('TR-16: air_quality %s gives undefined', (_name, airQuality) => {
    const current = { ...(sampleCurrent() as Record<string, unknown>), air_quality: airQuality };

    expect(toCurrentWeather(current).airQuality).toBeUndefined();
    expect(toCurrentWeather(current).astro).toEqual(SAMPLE_OPTIONAL_WEATHER.astro);
  });

  it('TR-16: a group with one valid field keeps only that field', () => {
    const current = {
      ...(sampleCurrent() as Record<string, unknown>),
      astro: { moon_illumination: 0 },
    };

    expect(toCurrentWeather(current).astro).toEqual({ moonIllumination: 0 });
  });
});
