import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from './errors.ts';

describe('ERROR_CODES', () => {
  it('FR-10: lists the error contract codes in table order', () => {
    expect(ERROR_CODES).toEqual([
      'BAD_USER_INPUT',
      'PROPERTY_ALREADY_EXISTS',
      'PROPERTY_NOT_FOUND',
      'WEATHER_QUOTA_EXCEEDED',
      'WEATHER_UNAVAILABLE',
      'WEATHER_LOCATION_MISMATCH',
      'INTERNAL_SERVER_ERROR',
    ]);
  });
});
