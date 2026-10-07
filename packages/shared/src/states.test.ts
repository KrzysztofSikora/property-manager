import { describe, expect, it } from 'vitest';
import { isStateCode, stateName, US_STATES } from './states.ts';

describe('US_STATES', () => {
  it('TR-09: holds the 50 states plus DC', () => {
    expect(Object.keys(US_STATES)).toHaveLength(51);
  });

  it('TR-09: every entry is a 2-letter upper-case code with a non-empty name', () => {
    for (const [code, name] of Object.entries(US_STATES)) {
      expect(code).toMatch(/^[A-Z]{2}$/);
      expect(name.trim()).not.toBe('');
    }
  });

  it('TR-09: has no duplicate names', () => {
    expect(new Set(Object.values(US_STATES)).size).toBe(51);
  });
});

describe('isStateCode', () => {
  it.each(['AZ', 'DC', 'AL', 'WY'])('accepts %s', (value) => {
    expect(isStateCode(value)).toBe(true);
  });

  it.each(['PR', 'XX', 'az', 'Arizona', '', 'toString', 'constructor'])('rejects %j', (value) => {
    expect(isStateCode(value)).toBe(false);
  });
});

describe('stateName', () => {
  it('maps DC to District of Columbia', () => {
    expect(stateName('DC')).toBe('District of Columbia');
  });

  it('maps AZ to Arizona', () => {
    expect(stateName('AZ')).toBe('Arizona');
  });
});
