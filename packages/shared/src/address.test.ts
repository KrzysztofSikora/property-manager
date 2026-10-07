import { describe, expect, it } from 'vitest';
import {
  addressSchema,
  type AddressInput,
  normalizeAddress,
  normalizeAddressText,
} from './address.ts';

const valid: AddressInput = {
  street: '15528 E Golden Eagle Blvd',
  city: 'Fountain Hills',
  state: 'AZ',
  zipCode: '85268',
};

function issuePaths(input: AddressInput): unknown[] {
  const result = addressSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path[0]);
}

describe('normalizeAddressText', () => {
  it.each([
    ['  15528  E Golden Eagle Blvd ', '15528 E Golden Eagle Blvd'],
    ['Fountain\t\tHills', 'Fountain Hills'],
    ['a \n b', 'a b'],
    ['   ', ''],
    ['already clean', 'already clean'],
  ])('TR-07: %j becomes %j', (input, expected) => {
    expect(normalizeAddressText(input)).toBe(expected);
  });
});

describe('addressSchema normalization', () => {
  it('FR-05 AC3: trims and collapses street/city, upper-cases state, keeps case', () => {
    expect(
      normalizeAddress({
        street: '  15528  E Golden Eagle Blvd ',
        city: ' Fountain   Hills ',
        state: 'az',
        zipCode: '85268',
      }),
    ).toEqual(valid);
  });

  it('TR-07: keeps the original case of street and city for display', () => {
    const out = normalizeAddress({
      ...valid,
      street: '15528 e golden eagle  blvd',
      city: 'FOUNTAIN HILLS',
    });
    expect(out.street).toBe('15528 e golden eagle blvd');
    expect(out.city).toBe('FOUNTAIN HILLS');
  });

  it('accepts the canonical address unchanged', () => {
    expect(addressSchema.parse(valid)).toEqual(valid);
  });
});

describe('addressSchema zipCode', () => {
  it.each(['8526', '852680', '85268-1234', '8526A', '', ' 85268'])(
    'FR-07 AC1: rejects %j on zipCode',
    (zipCode) => {
      expect(issuePaths({ ...valid, zipCode })).toEqual(['zipCode']);
    },
  );

  it('FR-07 AC2: keeps "02108" as a string with its leading zero', () => {
    expect(normalizeAddress({ ...valid, zipCode: '02108' }).zipCode).toBe('02108');
  });
});

describe('addressSchema state', () => {
  it.each(['PR', 'XX', 'Arizona', '', 'A'])('FR-07 AC3: rejects %j on state', (state) => {
    expect(issuePaths({ ...valid, state })).toEqual(['state']);
  });

  it.each([
    ['dc', 'DC'],
    ['ny', 'NY'],
    [' az ', 'AZ'],
    ['Wy', 'WY'],
  ])('FR-07 AC3: accepts %j as %j', (state, expected) => {
    expect(normalizeAddress({ ...valid, state }).state).toBe(expected);
  });
});

describe('addressSchema street and city lengths', () => {
  it.each([
    ['street', ''],
    ['street', '   '],
    ['street', 'a'.repeat(201)],
    ['street', ` ${'a'.repeat(201)} `],
    ['city', ''],
    ['city', ' \t '],
    ['city', 'a'.repeat(101)],
  ] as const)('FR-07 AC4: rejects %s %j', (field, value) => {
    expect(issuePaths({ ...valid, [field]: value })).toEqual([field]);
  });

  it.each([
    ['street', 'a'.repeat(200), 200],
    ['street', `  ${'a'.repeat(200)}  `, 200],
    ['street', 'a', 1],
    ['city', 'a'.repeat(100), 100],
    ['city', `  ${'a'.repeat(100)}  `, 100],
    ['city', 'a', 1],
  ] as const)('FR-07 AC4: accepts %s of length %#', (field, value, length) => {
    expect(normalizeAddress({ ...valid, [field]: value })[field]).toHaveLength(length);
  });

  it('measures length after collapsing inner whitespace', () => {
    const street = `${'a'.repeat(100)}     ${'b'.repeat(99)}`;
    expect(normalizeAddress({ ...valid, street }).street).toHaveLength(200);
  });
});

describe('addressSchema messages', () => {
  it('FR-07 AC5: reports every invalid field with a distinct path', () => {
    const paths = issuePaths({ street: ' ', city: '', state: 'XX', zipCode: '123' });
    expect(new Set(paths)).toEqual(new Set(['street', 'city', 'state', 'zipCode']));
  });

  it.each([
    ['street', 'x'.repeat(201)],
    ['city', 'secret-city-value'.repeat(10)],
    ['state', 'Arizona'],
    ['zipCode', '8526A'],
  ] as const)('does not echo the %s input in its message', (field, value) => {
    const result = addressSchema.safeParse({ ...valid, [field]: value });
    expect(result.success).toBe(false);
    for (const issue of result.error?.issues ?? []) {
      expect(issue.message).not.toContain(value.trim());
      expect(issue.message).not.toBe('');
    }
  });
});

describe('normalizeAddress', () => {
  it('throws on invalid input', () => {
    expect(() => normalizeAddress({ ...valid, zipCode: '1' })).toThrow();
  });
});
