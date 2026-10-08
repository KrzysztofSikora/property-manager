import { normalizeAddress } from '@property-manager/shared';
import pg from 'pg';
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { createDb } from '../../src/db/client.ts';
import type { NewProperty } from '../../src/domain/property.ts';
import { PropertyAlreadyExistsError } from '../../src/domain/errors.ts';
import { createPropertyRepository } from '../../src/repositories/property.repository.ts';
import { validInput } from '../fixtures/property.ts';
import { SAMPLE_OPTIONAL_WEATHER, weatherstackResponse } from '../fixtures/weatherstack.ts';
import { countProperties, resetDb, seedProperty } from '../helpers/db.ts';

const { db, close } = createDb(inject('databaseUrl'));
const repository = createPropertyRepository(db);

afterAll(close);

beforeEach(async () => {
  await resetDb(db);
});

function sampleCurrent(): Record<string, unknown> {
  const { current } = weatherstackResponse();
  if (typeof current !== 'object' || current === null || Array.isArray(current)) {
    throw new Error('the sample has no "current" object');
  }
  return current;
}

function newProperty(overrides: Partial<NewProperty> = {}): NewProperty {
  return {
    ...normalizeAddress(validInput()),
    lat: 33.609,
    long: -111.729,
    weatherData: { units: 'IMPERIAL', current: sampleCurrent() },
    ...overrides,
  };
}

describe('PropertyRepository', () => {
  it('insert returns the stored property with a DB-generated id and createdAt', async () => {
    const before = new Date();

    const created = await repository.insert(newProperty());

    expect(created).toMatchObject({
      street: '15528 E Golden Eagle Blvd',
      city: 'Fountain Hills',
      state: 'AZ',
      zipCode: '85268',
      lat: 33.609,
      long: -111.729,
    });
    expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(created.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 5_000);
    expect(await countProperties(db)).toBe(1);
  });

  it('TR-16: maps the stored current to typed key fields and keeps the whole raw', async () => {
    const created = await repository.insert(newProperty());

    expect(created.weatherData).toEqual({
      units: 'IMPERIAL',
      current: {
        temperature: 82,
        feelsLike: 79,
        weatherDescriptions: ['Clear '],
        weatherIcons: [
          'https://cdn.worldweatheronline.com/images/wsymbols01_png_64/wsymbol_0008_clear_sky_night.png',
        ],
        windSpeed: 6,
        windDir: 'NE',
        humidity: 34,
        ...SAMPLE_OPTIONAL_WEATHER,
        raw: weatherstackResponse().current,
      },
    });
  });

  it('FR-05 AC1: findById round-trips every field of the inserted property', async () => {
    const created = await repository.insert(newProperty());

    expect(await repository.findById(created.id)).toEqual(created);
  });

  it('FR-07 AC2: zipCode "02108" is kept as a string', async () => {
    const created = await repository.insert(
      newProperty(
        normalizeAddress(
          validInput({ street: '1 Main St', city: 'Boston', state: 'MA', zipCode: '02108' }),
        ),
      ),
    );

    expect((await repository.findById(created.id))?.zipCode).toBe('02108');
  });

  it('findById of an unknown UUID returns null', async () => {
    await repository.insert(newProperty());

    expect(await repository.findById(crypto.randomUUID())).toBeNull();
  });

  it('findById rejects a stored row whose state is not a US state code', async () => {
    const row = await seedProperty(db, { state: 'XX' });

    await expect(repository.findById(row.id)).rejects.toThrow(/state/);
  });

  it('insert propagates a DB rejection and stores nothing', async () => {
    await expect(repository.insert(newProperty({ lat: 999 }))).rejects.toThrow();

    expect(await countProperties(db)).toBe(0);
  });

  it('insert propagates a non-unique DB rejection unchanged', async () => {
    const error: unknown = await repository
      .insert(newProperty({ lat: 999 }))
      .catch((e: unknown) => e);

    expect(error).not.toBeInstanceOf(PropertyAlreadyExistsError);
    expect(error).toHaveProperty('cause.code', '23514');
    expect(error).toHaveProperty('cause.constraint', 'properties_lat_range');
  });

  it('FR-08 AC2 (storage): a second insert of the same address throws PropertyAlreadyExistsError', async () => {
    await repository.insert(newProperty());

    const error: unknown = await repository
      .insert(newProperty({ street: '15528 E GOLDEN EAGLE BLVD', city: 'fountain hills' }))
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PropertyAlreadyExistsError);
    expect(error).toMatchObject({ code: 'PROPERTY_ALREADY_EXISTS' });
    expect(error).toHaveProperty('cause.cause', expect.any(pg.DatabaseError));
    expect(error).toHaveProperty('cause.cause.code', '23505');
    expect(error).toHaveProperty('cause.cause.constraint', 'properties_address_unique');
    expect(await countProperties(db)).toBe(1);
  });
});

describe('PropertyRepository.existsByAddress', () => {
  const address = normalizeAddress(validInput());

  it('is false on an empty table', async () => {
    expect(await repository.existsByAddress(address)).toBe(false);
  });

  it.each([
    ['the same address', validInput()],
    ['a case variant', validInput({ street: '15528 e golden eagle BLVD', city: 'FOUNTAIN HILLS' })],
    [
      'a spacing variant',
      validInput({ street: ' 15528  E Golden Eagle Blvd', city: 'Fountain  Hills ' }),
    ],
    ['a lower-case state', validInput({ state: 'az' })],
  ])('TR-07: is true for %s', async (_case, input) => {
    await seedProperty(db);

    expect(await repository.existsByAddress(normalizeAddress(input))).toBe(true);
  });

  it.each([
    ['street', { street: '15529 E Golden Eagle Blvd' }],
    ['city', { city: 'Scottsdale' }],
    ['state', { state: 'CA' }],
    ['zipCode', { zipCode: '85269' }],
  ] as const)('is false when only %s differs', async (_field, override) => {
    await seedProperty(db);

    expect(await repository.existsByAddress(normalizeAddress(validInput(override)))).toBe(false);
  });
});
