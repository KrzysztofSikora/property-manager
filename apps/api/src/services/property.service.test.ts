import { normalizeAddress } from '@property-manager/shared';
import { describe, expect, it } from 'vitest';
import { WeatherUnavailableError } from '../domain/errors.ts';
import { InMemoryPropertyRepository } from '../../test/fakes/property-repository.ts';
import { FakeWeatherClient } from '../../test/fakes/weather.ts';
import { validInput } from '../../test/fixtures/property.ts';
import { weatherstackError, weatherstackResponse } from '../../test/fixtures/weatherstack.ts';
import { createPropertyService, weatherQuery } from './property.service.ts';

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

  it('FR-05 AC6 (service half): a failing insert propagates and nothing is stored', async () => {
    const { service, repository, weather } = setup();
    const error = new Error('insert rejected');
    repository.failInsert(error);

    await expect(service.create(address)).rejects.toBe(error);
    expect(repository.rows).toEqual([]);
    expect(weather.calls).toHaveLength(1);
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
