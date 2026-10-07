import { GraphQLError, Kind, locatedError, parse } from 'graphql';
import type { FieldNode } from 'graphql';
import { describe, expect, it } from 'vitest';
import { captureLogs } from '../../test/helpers/logs.ts';
import { WeatherUnavailableError } from '../domain/errors.ts';
import { badUserInput, createMaskError } from './errors.ts';

const MASKED = 'Unexpected error.';
const PATH = ['createProperty'];

function fieldNode(): FieldNode {
  const [operation] = parse('mutation {\n  createProperty { id }\n}').definitions;
  if (operation?.kind !== Kind.OPERATION_DEFINITION) throw new Error('expected an operation');
  const [field] = operation.selectionSet.selections;
  if (field?.kind !== Kind.FIELD) throw new Error('expected a field');
  return field;
}

// What graphql 17 hands Yoga when a resolver throws `error`.
function thrownByResolver(error: unknown): GraphQLError {
  return locatedError(error, fieldNode(), PATH);
}

function setup() {
  const { logger, lines } = captureLogs();
  return { maskError: createMaskError(logger), lines };
}

function asGraphQLError(error: Error): GraphQLError {
  if (!(error instanceof GraphQLError)) throw new Error('expected a GraphQLError');
  return error;
}

describe('badUserInput', () => {
  it('FR-07 AC5: lists every field once, with the first issue per field', () => {
    const error = badUserInput([
      { path: ['state'], message: 'must be a 2-letter US state code (50 states or DC)' },
      { path: ['zipCode'], message: 'must be 5 digits' },
      { path: ['zipCode'], message: 'a second issue on the same field' },
    ]);

    expect(error.message).toBe(
      'Invalid input: state (must be a 2-letter US state code (50 states or DC)), zipCode (must be 5 digits)',
    );
    expect(error.extensions).toEqual({
      code: 'BAD_USER_INPUT',
      fields: [
        { field: 'state', message: 'must be a 2-letter US state code (50 states or DC)' },
        { field: 'zipCode', message: 'must be 5 digits' },
      ],
    });
  });

  it('names a nested field by its dotted path', () => {
    const error = badUserInput([{ path: ['filter', 'state'], message: 'must be 2 letters' }]);

    expect(error.extensions['fields']).toEqual([
      { field: 'filter.state', message: 'must be 2 letters' },
    ]);
  });
});

describe('createMaskError', () => {
  it('TR-12: passes a resolver-thrown BAD_USER_INPUT through with its fields', () => {
    const { maskError, lines } = setup();
    const error = thrownByResolver(
      badUserInput([{ path: ['zipCode'], message: 'must be 5 digits' }]),
    );

    const masked = asGraphQLError(maskError(error, MASKED));

    expect(masked).toBe(error);
    expect(masked.extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      fields: [{ field: 'zipCode', message: 'must be 5 digits' }],
    });
    expect(lines()).toEqual([]);
  });

  it('passes a GraphQLError without a cause (parse, validation) through', () => {
    const { maskError } = setup();
    const error = new GraphQLError('Syntax Error: Expected Name, found <EOF>.');

    expect(maskError(error, MASKED)).toBe(error);
  });

  it('TR-12: maps a resolver-thrown DomainError to its code, keeping message, path and locations', () => {
    const { maskError, lines } = setup();
    const domainError = new WeatherUnavailableError({ cause: { status: 500 } });

    const masked = asGraphQLError(maskError(thrownByResolver(domainError), MASKED));

    expect(masked.message).toBe(domainError.message);
    expect(masked.extensions).toEqual({ code: 'WEATHER_UNAVAILABLE' });
    expect(masked.path).toEqual(PATH);
    expect(masked.locations).toEqual([{ line: 2, column: 3 }]);
    expect(masked.cause).toBeUndefined();
    expect(lines()).toEqual([]);
  });

  it('TR-12: maps a bare DomainError (no GraphQL wrapper) to its code', () => {
    const { maskError } = setup();

    const masked = asGraphQLError(maskError(new WeatherUnavailableError(), MASKED));

    expect(masked.extensions).toEqual({ code: 'WEATHER_UNAVAILABLE' });
  });

  it('FR-10 AC2: masks a resolver-thrown Error, drops its cause and logs it', () => {
    const { maskError, lines } = setup();
    const error = new Error('insert into "properties" failed at /srv/app/src/db/client.ts:12');

    const masked = asGraphQLError(maskError(thrownByResolver(error), MASKED));

    expect(masked.message).toBe(MASKED);
    expect(masked.extensions).toEqual({ code: 'INTERNAL_SERVER_ERROR' });
    expect(masked.path).toEqual(PATH);
    expect(masked.locations).toEqual([{ line: 2, column: 3 }]);
    expect(masked.cause).toBeUndefined();
    expect(JSON.stringify(masked.toJSON())).not.toMatch(/insert into|\/srv\/app|stack/);
    expect(lines()).toHaveLength(1);
    expect(lines()[0]).toMatchObject({
      level: 50,
      msg: 'unexpected error',
      err: { message: error.message },
    });
  });

  it('FR-10 AC2: never adds originalError, even when told it runs in development', () => {
    const { maskError } = setup();

    const masked = asGraphQLError(maskError(thrownByResolver(new Error('boom')), MASKED, true));

    expect(masked.extensions).not.toHaveProperty('originalError');
    expect(JSON.stringify(masked.toJSON())).not.toContain('boom');
  });

  it.each([
    ['a string', 'boom'],
    ['null', null],
  ])('masks a thrown non-Error value: %s', (_case, value) => {
    const { maskError } = setup();

    const masked = asGraphQLError(maskError(value, MASKED));

    expect(masked.message).toBe(MASKED);
    expect(masked.extensions).toEqual({ code: 'INTERNAL_SERVER_ERROR' });
  });
});
