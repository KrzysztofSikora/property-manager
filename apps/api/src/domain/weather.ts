import { z } from 'zod';
import type { AirQuality, Astro, CurrentWeather } from './property.ts';

// What a valid Weatherstack `current` is: the key fields (types as in the recorded sample) are
// required, and every other field is kept as it came, for `raw`.
export const currentKeyFieldsSchema = z.looseObject({
  temperature: z.int(),
  feelslike: z.int(),
  weather_descriptions: z.array(z.string()),
  weather_icons: z.array(z.string()),
  wind_speed: z.int(),
  wind_dir: z.string(),
  humidity: z.int(),
});

export type WeatherReport = {
  lat: number;
  long: number;
  region: string;
  current: Record<string, unknown>;
};

// A missing or mistyped optional field becomes `undefined` on its own, so it never fails a parse
// and never hides the fields next to it (PRD data model, OQ-03).
function lenient<T extends z.ZodType>(schema: T) {
  return schema.optional().catch(undefined);
}

// Air-quality values come as numeric strings. `z.coerce.number()` would accept "" as 0.
const decimalString = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/)
  .transform(Number);

// `undefined` when no field is left, so a group without values is hidden like a missing one.
function nonEmpty<T extends Record<string, unknown>>(group: T): T | undefined {
  return Object.values(group).some((value) => value !== undefined) ? group : undefined;
}

const astroSchema = z
  .object({
    sunrise: lenient(z.string()),
    sunset: lenient(z.string()),
    moonrise: lenient(z.string()),
    moonset: lenient(z.string()),
    moon_phase: lenient(z.string()),
    moon_illumination: lenient(z.int()),
  })
  .transform((astro): Astro | undefined =>
    nonEmpty({
      sunrise: astro.sunrise,
      sunset: astro.sunset,
      moonrise: astro.moonrise,
      moonset: astro.moonset,
      moonPhase: astro.moon_phase,
      moonIllumination: astro.moon_illumination,
    }),
  );

const airQualitySchema = z
  .object({
    co: lenient(decimalString),
    no2: lenient(decimalString),
    o3: lenient(decimalString),
    so2: lenient(decimalString),
    pm2_5: lenient(decimalString),
    pm10: lenient(decimalString),
    'us-epa-index': lenient(decimalString.pipe(z.int())),
    'gb-defra-index': lenient(decimalString.pipe(z.int())),
  })
  .transform((airQuality): AirQuality | undefined =>
    nonEmpty({
      co: airQuality.co,
      no2: airQuality.no2,
      o3: airQuality.o3,
      so2: airQuality.so2,
      pm2_5: airQuality.pm2_5,
      pm10: airQuality.pm10,
      usEpaIndex: airQuality['us-epa-index'],
      gbDefraIndex: airQuality['gb-defra-index'],
    }),
  );

// Every field is lenient, so this schema never fails on an object.
const optionalFieldsSchema = z.object({
  observation_time: lenient(z.string()),
  weather_code: lenient(z.int()),
  wind_degree: lenient(z.int()),
  pressure: lenient(z.int()),
  precip: lenient(z.number()),
  cloudcover: lenient(z.int()),
  uv_index: lenient(z.int()),
  visibility: lenient(z.int()),
  is_day: lenient(z.enum(['yes', 'no']).transform((value) => value === 'yes')),
  astro: lenient(astroSchema),
  air_quality: lenient(airQualitySchema),
});

// Throws a ZodError when a key field is missing or mistyped. Callers decide what that means.
export function toCurrentWeather(raw: unknown): CurrentWeather {
  const current = currentKeyFieldsSchema.parse(raw);
  const optional = optionalFieldsSchema.parse(current);
  return {
    temperature: current.temperature,
    feelsLike: current.feelslike,
    weatherDescriptions: current.weather_descriptions,
    weatherIcons: current.weather_icons,
    windSpeed: current.wind_speed,
    windDir: current.wind_dir,
    humidity: current.humidity,
    observationTime: optional.observation_time,
    weatherCode: optional.weather_code,
    windDegree: optional.wind_degree,
    pressure: optional.pressure,
    precip: optional.precip,
    cloudCover: optional.cloudcover,
    uvIndex: optional.uv_index,
    visibility: optional.visibility,
    isDay: optional.is_day,
    astro: optional.astro,
    airQuality: optional.air_quality,
    raw: current,
  };
}
