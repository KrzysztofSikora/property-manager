import { ERROR_CODES } from '@property-manager/shared';
import { describe, expect, it } from 'vitest';
import { GraphQLRequestError } from './execute';
import {
  CREATE_ERROR_MESSAGES,
  createErrorMessage,
  errorCode,
  fieldErrors,
} from './graphql-errors';

function requestError(code: unknown, message = 'server message', extra = {}) {
  return new GraphQLRequestError(200, [{ message, extensions: { code, ...extra } }]);
}

describe('errorCode', () => {
  it.each([
    [
      'a known code',
      new GraphQLRequestError(200, [
        { message: 'gone', extensions: { code: 'PROPERTY_NOT_FOUND' } },
      ]),
      'PROPERTY_NOT_FOUND',
    ],
    [
      'the first error when there are several',
      new GraphQLRequestError(200, [
        { message: 'bad', extensions: { code: 'BAD_USER_INPUT' } },
        { message: 'gone', extensions: { code: 'PROPERTY_NOT_FOUND' } },
      ]),
      'BAD_USER_INPUT',
    ],
    [
      'an unknown code string',
      new GraphQLRequestError(200, [{ message: 'x', extensions: { code: 'NOT_A_CODE' } }]),
      undefined,
    ],
    [
      'a non-string code',
      new GraphQLRequestError(200, [{ message: 'x', extensions: { code: 404 } }]),
      undefined,
    ],
    ['no extensions', new GraphQLRequestError(200, [{ message: 'x' }]), undefined],
    ['no errors (HTTP failure)', new GraphQLRequestError(502, []), undefined],
    ['a plain Error', new Error('PROPERTY_NOT_FOUND'), undefined],
    [
      'a look-alike object that is not a GraphQLRequestError',
      { errors: [{ message: 'x', extensions: { code: 'PROPERTY_NOT_FOUND' } }] },
      undefined,
    ],
    ['undefined', undefined, undefined],
  ])('returns the code for %s', (_name, error, expected) => {
    expect(errorCode(error)).toBe(expected);
  });
});

// TR-19: a code added to the contract without a create-form message fails here (and in tsc).
describe('CREATE_ERROR_MESSAGES', () => {
  it.each(ERROR_CODES)('has a message for %s', (code) => {
    expect(CREATE_ERROR_MESSAGES[code].trim()).not.toBe('');
  });

  it('names the cause FR-10 lists for each create error', () => {
    expect(CREATE_ERROR_MESSAGES.PROPERTY_ALREADY_EXISTS).toMatch(/already exists/i);
    expect(CREATE_ERROR_MESSAGES.WEATHER_QUOTA_EXCEEDED).toMatch(
      /upgrade the plan or replace the api key/i,
    );
    expect(CREATE_ERROR_MESSAGES.WEATHER_UNAVAILABLE).toMatch(/try again later/i);
    expect(CREATE_ERROR_MESSAGES.WEATHER_LOCATION_MISMATCH).toMatch(/different state/i);
    expect(CREATE_ERROR_MESSAGES.INTERNAL_SERVER_ERROR).toMatch(/not saved\. try again/i);
  });
});

describe('createErrorMessage', () => {
  it.each(ERROR_CODES.filter((code) => code !== 'WEATHER_LOCATION_MISMATCH'))(
    'shows the table message for %s, not the server text',
    (code) => {
      expect(createErrorMessage(requestError(code))).toBe(CREATE_ERROR_MESSAGES[code]);
    },
  );

  it('shows the server message for a location mismatch, which names both states', () => {
    const message =
      'Weatherstack placed this address in "Nevada", not in AZ (Arizona). The property was not saved.';
    expect(createErrorMessage(requestError('WEATHER_LOCATION_MISMATCH', message))).toBe(message);
  });

  it.each([
    ['empty', ''],
    ['blank', '   '],
  ])('falls back to the table for a location mismatch with an %s message', (_name, message) => {
    expect(createErrorMessage(requestError('WEATHER_LOCATION_MISMATCH', message))).toBe(
      CREATE_ERROR_MESSAGES.WEATHER_LOCATION_MISMATCH,
    );
  });

  it.each([
    ['an unknown code', requestError('NOT_A_CODE')],
    ['an HTTP failure without errors', new GraphQLRequestError(502, [])],
    ['a network failure', new TypeError('Failed to fetch')],
    ['a plain Error', new Error('WEATHER_UNAVAILABLE')],
    ['undefined', undefined],
  ])('shows the generic message for %s', (_name, error) => {
    expect(createErrorMessage(error)).toBe(CREATE_ERROR_MESSAGES.INTERNAL_SERVER_ERROR);
  });
});

describe('fieldErrors', () => {
  it('maps each named address field to its message', () => {
    const error = requestError('BAD_USER_INPUT', 'Invalid input', {
      fields: [
        { field: 'street', message: 'must not be empty' },
        { field: 'city', message: 'must be at most 100 characters' },
        { field: 'state', message: 'must be a 2-letter US state code (50 states or DC)' },
        { field: 'zipCode', message: 'must be 5 digits' },
      ],
    });
    expect(fieldErrors(error)).toEqual({
      street: 'must not be empty',
      city: 'must be at most 100 characters',
      state: 'must be a 2-letter US state code (50 states or DC)',
      zipCode: 'must be 5 digits',
    });
  });

  it('keeps the known field and drops an unknown one', () => {
    const error = requestError('BAD_USER_INPUT', 'Invalid input', {
      fields: [
        { field: 'country', message: 'not supported' },
        { field: 'zipCode', message: 'must be 5 digits' },
      ],
    });
    expect(fieldErrors(error)).toEqual({ zipCode: 'must be 5 digits' });
  });

  it('gives nothing when only unknown fields are named', () => {
    const error = requestError('BAD_USER_INPUT', 'Invalid input', {
      fields: [{ field: 'address.street', message: 'must not be empty' }],
    });
    expect(fieldErrors(error)).toEqual({});
  });

  it('keeps the first message when a field is named twice', () => {
    const error = requestError('BAD_USER_INPUT', 'Invalid input', {
      fields: [
        { field: 'zipCode', message: 'must be 5 digits' },
        { field: 'zipCode', message: 'second message' },
      ],
    });
    expect(fieldErrors(error)).toEqual({ zipCode: 'must be 5 digits' });
  });

  it.each([
    ['missing', undefined],
    ['not an array', 'zipCode: must be 5 digits'],
    ['an entry without a message', [{ field: 'zipCode' }]],
    ['an entry with a non-string field', [{ field: 3, message: 'must be 5 digits' }]],
  ])('gives nothing when fields is %s', (_name, fields) => {
    expect(fieldErrors(requestError('BAD_USER_INPUT', 'Invalid input', { fields }))).toEqual({});
  });

  it('ignores fields on an error that is not BAD_USER_INPUT', () => {
    const error = requestError('PROPERTY_ALREADY_EXISTS', 'exists', {
      fields: [{ field: 'zipCode', message: 'must be 5 digits' }],
    });
    expect(fieldErrors(error)).toEqual({});
  });

  it.each([
    ['a network failure', new TypeError('Failed to fetch')],
    ['undefined', undefined],
  ])('gives nothing for %s', (_name, error) => {
    expect(fieldErrors(error)).toEqual({});
  });
});
