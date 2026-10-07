import { z } from 'zod';
import type { CurrentWeather } from './property.ts';

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

// Throws a ZodError when a key field is missing or mistyped. Callers decide what that means.
export function toCurrentWeather(raw: unknown): CurrentWeather {
  const current = currentKeyFieldsSchema.parse(raw);
  return {
    temperature: current.temperature,
    feelsLike: current.feelslike,
    weatherDescriptions: current.weather_descriptions,
    weatherIcons: current.weather_icons,
    windSpeed: current.wind_speed,
    windDir: current.wind_dir,
    humidity: current.humidity,
    raw: current,
  };
}
