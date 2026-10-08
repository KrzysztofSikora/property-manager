import type { PropertiesQuery } from '../graphql/graphql';

// A stored property as the API returns it: the PRD's canonical address, with the key weather
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
    };
  };
};

export type PropertyListItem = PropertiesQuery['properties']['items'][number];

// A row of the `Properties` list: the list fields of `propertyFixture`.
export function listItem(overrides: Partial<PropertyListItem> = {}): PropertyListItem {
  const { id, street, city, state, zipCode, createdAt } = propertyFixture();
  return { id, street, city, state, zipCode, createdAt, ...overrides };
}
