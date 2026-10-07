import { DrizzleQueryError } from 'drizzle-orm';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { escapeLike, isAddressUniqueViolation } from './property.repository.ts';

function pgError(code: string, constraint: string): pg.DatabaseError {
  const error = new pg.DatabaseError('constraint violated', 0, 'error');
  error.code = code;
  error.constraint = constraint;
  return error;
}

const wrapped = (cause: Error) => new DrizzleQueryError('insert into "properties"', [], cause);

describe('isAddressUniqueViolation', () => {
  it.each([
    [
      'a wrapped 23505 on the address index',
      wrapped(pgError('23505', 'properties_address_unique')),
    ],
    ['a bare 23505 on the address index', pgError('23505', 'properties_address_unique')],
  ])('TR-06: %s is a duplicate', (_case, error) => {
    expect(isAddressUniqueViolation(error)).toBe(true);
  });

  it.each([
    ['a wrapped 23505 on another constraint', wrapped(pgError('23505', 'properties_pkey'))],
    ['a bare 23505 on another constraint', pgError('23505', 'properties_pkey')],
    [
      'a wrapped 23514 on the address index',
      wrapped(pgError('23514', 'properties_address_unique')),
    ],
    [
      'a wrapper whose cause only looks like a pg error',
      wrapped(
        Object.assign(new Error('x'), { code: '23505', constraint: 'properties_address_unique' }),
      ),
    ],
    ['an Error without a cause', new Error('insert rejected')],
    ['a non-Error value', { code: '23505', constraint: 'properties_address_unique' }],
  ])('%s is not a duplicate', (_case, error) => {
    expect(isAddressUniqueViolation(error)).toBe(false);
  });
});

describe('escapeLike', () => {
  it.each([
    ['plain text', 'Fountain Hills', 'Fountain Hills'],
    ['%', '100% Town', '100\\% Town'],
    ['_', 'St_Paul', 'St\\_Paul'],
    ['\\', 'a\\b', 'a\\\\b'],
    ['a mix', '\\%_%', '\\\\\\%\\_\\%'],
  ])('TR-13: %s', (_case, value, escaped) => {
    expect(escapeLike(value)).toBe(escaped);
  });
});
