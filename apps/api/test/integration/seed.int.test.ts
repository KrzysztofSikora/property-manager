import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SeedAddress } from '../../src/seed/addresses.ts';
import { runSeed } from '../../src/seed/seed.ts';
import type { FakeWeatherClient } from '../fakes/weather.ts';
import { createTestApp } from '../helpers/app.ts';
import type { TestApp } from '../helpers/app.ts';
import { resetDb } from '../helpers/db.ts';
import { PROPERTIES } from '../operations.ts';

// Arizona, like the fake's recorded sample, so the region check passes.
const ADDRESSES: readonly SeedAddress[] = [
  { street: '15528 E Golden Eagle Blvd', city: 'Fountain Hills', state: 'AZ', zipCode: '85268' },
  { street: '1700 W Washington St', city: 'Phoenix', state: 'AZ', zipCode: '85007' },
];

let app: TestApp<FakeWeatherClient>;

beforeEach(async () => {
  app = createTestApp();
  await resetDb(app.db);
});

afterEach(async () => {
  await app.close();
});

async function seed(): Promise<{ code: number; sleeps: number[]; stderr: string[] }> {
  const sleeps: number[] = [];
  const stderr: string[] = [];
  const code = await runSeed({
    apiUrl: 'http://localhost/graphql',
    addresses: ADDRESSES,
    fetch: app.fetch,
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    stdout: () => undefined,
    stderr: (line) => stderr.push(line),
  });
  return { code, sleeps, stderr };
}

async function storedAddresses(): Promise<unknown> {
  const result = await app.execute(PROPERTIES, { sort: 'CREATED_AT_ASC' });
  expect(result.errors).toBeUndefined();
  return result.data;
}

describe('FR-16 AC1: pnpm seed through the real app', () => {
  it('creates the properties through createProperty, and a re-run skips them for free', async () => {
    const first = await seed();

    expect(first).toEqual({ code: 0, sleeps: [1500], stderr: [] });
    expect(app.weather.calls).toHaveLength(2);
    expect(await storedAddresses()).toMatchObject({
      properties: { totalCount: 2, items: ADDRESSES.map((address) => ({ ...address })) },
    });

    const second = await seed();

    expect(second).toEqual({ code: 0, sleeps: [], stderr: [] });
    expect(app.weather.calls).toHaveLength(2);
    expect(await storedAddresses()).toMatchObject({ properties: { totalCount: 2 } });
  });
});
