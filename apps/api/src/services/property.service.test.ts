import { normalizeAddress } from '@property-manager/shared';
import { describe, expect, it } from 'vitest';
import {
  PropertyAlreadyExistsError,
  WeatherLocationMismatchError,
  WeatherUnavailableError,
} from '../domain/errors.ts';
import { InMemoryPropertyRepository } from '../../test/fakes/property-repository.ts';
import { FakeWeatherClient } from '../../test/fakes/weather.ts';
import { validInput } from '../../test/fixtures/property.ts';
import { weatherstackError, weatherstackResponse } from '../../test/fixtures/weatherstack.ts';
import { createPropertyService, regionMatchesState, weatherQuery } from './property.service.ts';

function setup(weather = new FakeWeatherClient()) {
  const repository = new InMemoryPropertyRepository();
  const service = createPropertyService({ repository, weather });
  return { repository, weather, service };
}

const address = normalizeAddress(validInput());

describe('weatherQuery', () => {
  it('FR-05 AC2: builds "<street>, <city>, <state> <zipCode>, United States"', () => {
    expect(weatherQuery(address)).toBe(
      '15528 E Golden Eagle Blvd, Fountain Hills, AZ 85268, United States',
    );
  });

  it('uses the fields it is given, in order', () => {
    const other = normalizeAddress(
      validInput({ street: '1 Main St', city: 'Boston', state: 'MA', zipCode: '02108' }),
    );

    expect(weatherQuery(other)).toBe('1 Main St, Boston, MA 02108, United States');
  });
});

describe('regionMatchesState', () => {
  it.each([
    ['Arizona', 'AZ'],
    ['arizona', 'AZ'],
    [' Arizona ', 'AZ'],
    ['ARIZONA', 'AZ'],
    ['District of Columbia', 'DC'],
    ['Massachusetts', 'MA'],
  ] as const)('TR-09: %j matches %s', (region, state) => {
    expect(regionMatchesState(region, state)).toBe(true);
  });

  it.each([
    ['California', 'AZ'],
    ['', 'AZ'],
    ['   ', 'AZ'],
    ['Arizona Territory', 'AZ'],
    ['North Arizona', 'AZ'],
    ['Virginia', 'WV'],
    ['West Virginia', 'VA'],
    ['Washington', 'DC'],
  ] as const)('TR-09: %j does not match %s', (region, state) => {
    expect(regionMatchesState(region, state)).toBe(false);
  });
});

describe('WeatherLocationMismatchError', () => {
  it('names the state code, the state name and the returned region', () => {
    const error = new WeatherLocationMismatchError('AZ', 'California');

    expect(error.code).toBe('WEATHER_LOCATION_MISMATCH');
    expect(error.state).toBe('AZ');
    expect(error.region).toBe('California');
    expect(error.message).toBe(
      'Weatherstack placed this address in "California", not in AZ (Arizona). The property was not saved.',
    );
  });

  it('trims the region and cuts it to 100 characters', () => {
    const long = `  ${'x'.repeat(150)}  `;

    const error = new WeatherLocationMismatchError('AZ', long);

    expect(error.region).toBe('x'.repeat(100));
    expect(error.message).toContain(`"${'x'.repeat(100)}"`);
    expect(error.message).not.toContain('x'.repeat(101));
  });
});

describe('PropertyService.create', () => {
  it('FR-05 AC2 (service half): calls the weather client exactly once with the query', async () => {
    const { service, weather } = setup();

    await service.create(address);

    expect(weather.calls).toEqual([
      '15528 E Golden Eagle Blvd, Fountain Hills, AZ 85268, United States',
    ]);
  });

  it('FR-05 AC1: stores the address, coordinates and the whole current as IMPERIAL', async () => {
    const { service, repository } = setup();

    const created = await service.create(address);

    expect(repository.rows).toEqual([created]);
    expect(created).toMatchObject({ ...address, lat: 33.609, long: -111.729 });
    expect(created.weatherData.units).toBe('IMPERIAL');
    expect(created.weatherData.current.raw).toEqual(weatherstackResponse().current);
    expect(created.weatherData.current.temperature).toBe(82);
  });

  it('takes lat/long from the weather report', async () => {
    const body = weatherstackResponse({ location: { lat: '42.358', lon: '-71.064' } });
    const { service } = setup(new FakeWeatherClient(body));

    const created = await service.create(address);

    expect(created).toMatchObject({ lat: 42.358, long: -71.064 });
  });

  it('a weather failure propagates and inserts nothing', async () => {
    const body = weatherstackError(615, 'request_failed');
    const { service, repository } = setup(new FakeWeatherClient(body));

    await expect(service.create(address)).rejects.toBeInstanceOf(WeatherUnavailableError);
    expect(repository.rows).toEqual([]);
  });

  it('FR-05 AC4 (service half): a region mismatch makes one weather call and inserts nothing', async () => {
    const body = weatherstackResponse({ location: { region: 'California' } });
    const { service, repository, weather } = setup(new FakeWeatherClient(body));

    const error: unknown = await service.create(address).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(WeatherLocationMismatchError);
    expect(error).toMatchObject({
      code: 'WEATHER_LOCATION_MISMATCH',
      state: 'AZ',
      region: 'California',
    });
    expect(weather.calls).toHaveLength(1);
    expect(repository.rows).toEqual([]);
  });

  it('FR-05 AC6 (service half): a failing insert propagates and nothing is stored', async () => {
    const { service, repository, weather } = setup();
    const error = new Error('insert rejected');
    repository.failInsert(error);

    await expect(service.create(address)).rejects.toBe(error);
    expect(repository.rows).toEqual([]);
    expect(weather.calls).toHaveLength(1);
  });
});

describe('PropertyService.create duplicates', () => {
  it('FR-08 AC1 (service half): a stored address makes no weather call and inserts nothing', async () => {
    const { service, repository, weather } = setup();
    const stored = await service.create(address);
    weather.calls.length = 0;
    const variant = normalizeAddress(
      validInput({ street: '15528 e golden eagle  blvd', city: 'FOUNTAIN HILLS' }),
    );

    const error: unknown = await service.create(variant).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PropertyAlreadyExistsError);
    expect(error).toMatchObject({ code: 'PROPERTY_ALREADY_EXISTS' });
    expect(weather.calls).toEqual([]);
    expect(repository.rows).toEqual([stored]);
  });

  it('FR-08 AC2 (service half): a duplicate on insert after a clean pre-check propagates', async () => {
    const { service, repository, weather } = setup();
    const error = new PropertyAlreadyExistsError();
    repository.failInsert(error);

    await expect(service.create(address)).rejects.toBe(error);
    expect(weather.calls).toHaveLength(1);
    expect(repository.rows).toEqual([]);
  });
});

describe('PropertyService.getById', () => {
  it('returns the stored property', async () => {
    const { service } = setup();
    const created = await service.create(address);

    expect(await service.getById(created.id)).toEqual(created);
  });

  it('returns null for an unknown id', async () => {
    const { service } = setup();

    expect(await service.getById(crypto.randomUUID())).toBeNull();
  });
});
