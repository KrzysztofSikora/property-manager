import { describe, expect, it } from 'vitest';
import { validInput } from './property.ts';

describe('validInput', () => {
  it('is the PRD canonical address', () => {
    expect(validInput()).toEqual({
      street: '15528 E Golden Eagle Blvd',
      city: 'Fountain Hills',
      state: 'AZ',
      zipCode: '85268',
    });
  });

  it('applies overrides to a fresh object', () => {
    const changed = validInput({ zipCode: '85269' });

    expect(changed).toEqual({ ...validInput(), zipCode: '85269' });
    expect(validInput().zipCode).toBe('85268');
  });
});
