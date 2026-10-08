import { describe, expect, it } from 'vitest';
import { GraphQLRequestError } from './execute';
import { errorCode } from './graphql-errors';

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
