import type { PropertiesQuery } from '../graphql/graphql';

// A stored property as the API returns it: the PRD's canonical address, with the typed weather
// fields of the recorded Weatherstack sample. `raw` is left out because no page asks for it.
export function propertyFixture(overrides: Partial<PropertyFixture> = {}): PropertyFixture {
  return {
    id: '0b6f5c2e-6a51-4d8e-9f1e-3c2a7d9b4e10',
    street: '15528 E Golden Eagle Blvd',
    city: 'Fountain Hills',
    state: 'AZ',
    zipCode: '85268',
    lat: 33.609,
    long: -111.729,
    createdAt: '2026-09-14T15:42:00.000Z',
    weatherData: {
      units: 'IMPERIAL',
      current: {
        temperature: 82,
        feelsLike: 79,
        weatherDescriptions: ['Clear'],
        weatherIcons: [
          'https://cdn.worldweatheronline.com/images/wsymbols01_png_64/wsymbol_0008_clear_sky_night.png',
        ],
        windSpeed: 6,
        windDir: 'NE',
        humidity: 34,
        observationTime: '01:13 PM',
        pressure: 1010,
        precip: 0,
        cloudCover: 0,
        uvIndex: 0,
        visibility: 6,
        astro: {
          sunrise: '06:25 AM',
          sunset: '06:03 PM',
          moonrise: '03:22 AM',
          moonset: '04:27 PM',
          moonPhase: 'Waning Crescent',
          moonIllumination: 15,
        },
        airQuality: {
          co: 112,
          no2: 6.9,
          o3: 21,
          so2: 0.2,
          pm2_5: 4.6,
          pm10: 10.4,
          usEpaIndex: 1,
          gbDefraIndex: 1,
        },
      },
    },
    ...overrides,
  };
}

export type PropertyFixture = {
  id: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  lat: number;
  long: number;
  createdAt: string;
  weatherData: {
    units: 'IMPERIAL';
    current: {
      temperature: number;
      feelsLike: number;
      weatherDescriptions: string[];
      weatherIcons: string[];
      windSpeed: number;
      windDir: string;
      humidity: number;
      observationTime: string | null;
      pressure: number | null;
      precip: number | null;
      cloudCover: number | null;
      uvIndex: number | null;
      visibility: number | null;
      astro: {
        sunrise: string | null;
        sunset: string | null;
        moonrise: string | null;
        moonset: string | null;
        moonPhase: string | null;
        moonIllumination: number | null;
      } | null;
      airQuality: {
        co: number | null;
        no2: number | null;
        o3: number | null;
        so2: number | null;
        pm2_5: number | null;
        pm10: number | null;
        usEpaIndex: number | null;
        gbDefraIndex: number | null;
      } | null;
    };
  };
};

export type PropertyListItem = PropertiesQuery['properties']['items'][number];

// A row of the `Properties` list: the list fields of `propertyFixture`.
export function listItem(overrides: Partial<PropertyListItem> = {}): PropertyListItem {
  const { id, street, city, state, zipCode, createdAt, weatherData } = propertyFixture();
  const { temperature, weatherDescriptions, weatherIcons } = weatherData.current;
  return {
    id,
    street,
    city,
    state,
    zipCode,
    createdAt,
    weatherData: { current: { temperature, weatherDescriptions, weatherIcons } },
    ...overrides,
  };
}
