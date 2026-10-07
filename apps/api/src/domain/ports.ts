import type { NewProperty, Property } from './property.ts';
import type { WeatherReport } from './weather.ts';

// Implemented by the Weatherstack adapter and by `FakeWeatherClient` in tests.
export type WeatherClient = {
  current(query: string): Promise<WeatherReport>;
};

export type PropertyRepository = {
  insert(property: NewProperty): Promise<Property>;
  findById(id: string): Promise<Property | null>;
};
