import type { Address } from '@property-manager/shared';

// Weatherstack `current.astro`. Times are "hh:mm AM/PM", local to the location.
export type Astro = {
  sunrise?: string;
  sunset?: string;
  moonrise?: string;
  moonset?: string;
  moonPhase?: string;
  // Percent.
  moonIllumination?: number;
};

// Weatherstack `current.air_quality`. Pollutants are in µg/m³.
export type AirQuality = {
  co?: number;
  no2?: number;
  o3?: number;
  so2?: number;
  pm2_5?: number;
  pm10?: number;
  usEpaIndex?: number;
  gbDefraIndex?: number;
};

// Weatherstack `current`, camelCased. The key fields are required; the others are optional and
// absent when missing or mistyped. `raw` holds the object as it was received.
export type CurrentWeather = {
  temperature: number;
  feelsLike: number;
  weatherDescriptions: string[];
  weatherIcons: string[];
  windSpeed: number;
  windDir: string;
  humidity: number;
  // "hh:mm AM/PM" in UTC, without a date.
  observationTime?: string;
  weatherCode?: number;
  windDegree?: number;
  // mb.
  pressure?: number;
  // Inches.
  precip?: number;
  // Percent.
  cloudCover?: number;
  uvIndex?: number;
  // Miles.
  visibility?: number;
  isDay?: boolean;
  astro?: Astro;
  airQuality?: AirQuality;
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

// Ties on `createdAt` are broken by `id` in the same direction (FR-02 AC3).
export type PropertySort = 'CREATED_AT_DESC' | 'CREATED_AT_ASC';

// Normalized, with blank values removed (FR-03 AC6).
export type PropertyFilter = { city?: string; state?: string; zipCode?: string };

// No `limit`: every match (FR-01 AC3).
export type PropertyListQuery = {
  filter: PropertyFilter;
  sort: PropertySort;
  limit?: number;
  offset: number;
};

export type PropertyPage = { items: Property[]; totalCount: number };
