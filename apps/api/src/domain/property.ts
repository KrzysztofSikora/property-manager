import type { Address } from '@property-manager/shared';

// The key fields of Weatherstack `current`, camelCased. Everything else stays in `raw`.
export type CurrentWeather = {
  temperature: number;
  feelsLike: number;
  weatherDescriptions: string[];
  weatherIcons: string[];
  windSpeed: number;
  windDir: string;
  humidity: number;
  raw: Record<string, unknown>;
};

export type WeatherData = { units: 'IMPERIAL'; current: CurrentWeather };

// What the `weather_data` jsonb column holds: the response `current` as Weatherstack sent it.
export type StoredWeather = { units: 'IMPERIAL'; current: Record<string, unknown> };

export type Property = Address & {
  id: string;
  lat: number;
  long: number;
  weatherData: WeatherData;
  createdAt: Date;
};

export type NewProperty = Address & { lat: number; long: number; weatherData: StoredWeather };
