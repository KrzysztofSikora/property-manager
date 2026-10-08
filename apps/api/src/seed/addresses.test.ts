import { addressSchema } from '@property-manager/shared';
import { describe, expect, it } from 'vitest';
import { SEED_ADDRESSES } from './addresses.ts';

describe('SEED_ADDRESSES', () => {
  it('FR-16: holds a few addresses', () => {
    expect(SEED_ADDRESSES.length).toBeGreaterThanOrEqual(3);
    expect(SEED_ADDRESSES.length).toBeLessThanOrEqual(6);
  });

  it.each(SEED_ADDRESSES.map((address) => [address.street, address]))(
    'FR-16: %s passes the shared address schema unchanged',
    (_street, address) => {
      expect(addressSchema.parse(address)).toEqual(address);
    },
  );

  it('FR-16: no two entries share the duplicate key (D-07), so none is skipped', () => {
    const keys = SEED_ADDRESSES.map((address) => {
      const { street, city, state, zipCode } = addressSchema.parse(address);
      return [street.toLowerCase(), city.toLowerCase(), state, zipCode].join('|');
    });

    expect(new Set(keys).size).toBe(SEED_ADDRESSES.length);
  });
});
