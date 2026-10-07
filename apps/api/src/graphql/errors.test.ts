import { GraphQLError, Kind, locatedError, parse } from 'graphql';
import type { FieldNode } from 'graphql';
import { describe, expect, it } from 'vitest';
import { captureLogs } from '../../test/helpers/logs.ts';
import { WeatherUnavailableError } from '../domain/errors.ts';
import { badUserInput, logUnexpectedErrors, maskError, summarizeError } from './errors.ts';

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

describe('maskError', () => {
  it('TR-12: passes a resolver-thrown BAD_USER_INPUT through with its fields', () => {
    const error = thrownByResolver(
      badUserInput([{ path: ['zipCode'], message: 'must be 5 digits' }]),
    );

    const masked = asGraphQLError(maskError(error, MASKED));

    expect(masked).toBe(error);
    expect(masked.extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      fields: [{ field: 'zipCode', message: 'must be 5 digits' }],
    });
  });

  it('passes a GraphQLError without a cause (parse, validation) through', () => {
    const error = new GraphQLError('Syntax Error: Expected Name, found <EOF>.');

    expect(maskError(error, MASKED)).toBe(error);
  });

  it('TR-12: maps a resolver-thrown DomainError to its code, keeping message, path and locations', () => {
    const domainError = new WeatherUnavailableError({ cause: { status: 500 } });

    const masked = asGraphQLError(maskError(thrownByResolver(domainError), MASKED));

    expect(masked.message).toBe(domainError.message);
    expect(masked.extensions).toEqual({ code: 'WEATHER_UNAVAILABLE' });
    expect(masked.path).toEqual(PATH);
    expect(masked.locations).toEqual([{ line: 2, column: 3 }]);
    expect(masked.cause).toBeUndefined();
  });

  it('TR-12: maps a bare DomainError (no GraphQL wrapper) to its code', () => {
    const masked = asGraphQLError(maskError(new WeatherUnavailableError(), MASKED));

    expect(masked.extensions).toEqual({ code: 'WEATHER_UNAVAILABLE' });
  });

  it('FR-10 AC2: masks a resolver-thrown Error and drops its cause', () => {
    const error = new Error('insert into "properties" failed at /srv/app/src/db/client.ts:12');

    const masked = asGraphQLError(maskError(thrownByResolver(error), MASKED));

    expect(masked.message).toBe(MASKED);
    expect(masked.extensions).toEqual({ code: 'INTERNAL_SERVER_ERROR' });
    expect(masked.path).toEqual(PATH);
    expect(masked.locations).toEqual([{ line: 2, column: 3 }]);
    expect(masked.cause).toBeUndefined();
    expect(JSON.stringify(masked.toJSON())).not.toMatch(/insert into|\/srv\/app|stack/);
  });

  it('FR-10 AC2: never adds originalError, even when told it runs in development', () => {
    const masked = asGraphQLError(maskError(thrownByResolver(new Error('boom')), MASKED, true));

    expect(masked.extensions).not.toHaveProperty('originalError');
    expect(JSON.stringify(masked.toJSON())).not.toContain('boom');
  });

  it.each([
    ['a string', 'boom'],
    ['null', null],
  ])('masks a thrown non-Error value: %s', (_case, value) => {
    const masked = asGraphQLError(maskError(value, MASKED));

    expect(masked.message).toBe(MASKED);
    expect(masked.extensions).toEqual({ code: 'INTERNAL_SERVER_ERROR' });
  });
});

// The shape of a Drizzle query error over a pg rejection: both quote the insert.
function databaseError(): Error {
  const pgError = Object.assign(
    new Error('new row violates check constraint "properties_lat_range"'),
    {
      name: 'DatabaseError',
      code: '23514',
      constraint: 'properties_lat_range',
      detail: 'Failing row contains (15528 E Golden Eagle Blvd, ...).',
    },
  );
  return Object.assign(
    new Error('Failed query: insert into "properties" params: 15528 E Golden Eagle Blvd', {
      cause: pgError,
    }),
    {
      name: 'DrizzleQueryError',
      query: 'insert into "properties"',
      params: ['15528 E Golden Eagle Blvd'],
    },
  );
}

describe('summarizeError', () => {
  it('keeps name, code, constraint and frames down the cause chain, and nothing user-supplied', () => {
    const summary = summarizeError(databaseError());

    expect(summary).toMatchObject({
      name: 'DrizzleQueryError',
      cause: { name: 'DatabaseError', code: '23514', constraint: 'properties_lat_range' },
    });
    expect(summary).not.toHaveProperty('code');
    expect(summary.frames?.[0]).toMatch(/^at /);
    expect(JSON.stringify(summary)).not.toMatch(/Golden Eagle|insert into|params|detail|Failed/);
  });

  it('stops after five causes', () => {
    let error = new Error('innermost');
    for (let level = 0; level < 10; level += 1)
      error = new Error(`level ${String(level)}`, { cause: error });

    let depth = 0;
    for (let summary = summarizeError(error).cause; summary; summary = summary.cause) depth += 1;

    expect(depth).toBe(5);
  });

  it.each([
    ['a string', 'boom', 'string'],
    ['null', null, 'null'],
    ['undefined', undefined, 'undefined'],
  ])('names a thrown non-Error value by its type: %s', (_case, value, name) => {
    expect(summarizeError(value)).toEqual({ name });
  });
});

describe('logUnexpectedErrors', () => {
  it('R1: logs an unexpected resolver error as a summary, without the insert or its params', () => {
    const { logger, lines } = captureLogs();

    logUnexpectedErrors(logger, [thrownByResolver(databaseError())]);

    expect(lines()).toHaveLength(1);
    expect(lines()[0]).toMatchObject({
      level: 50,
      msg: 'unexpected error',
      error: {
        name: 'DrizzleQueryError',
        cause: { code: '23514', constraint: 'properties_lat_range' },
      },
    });
    expect(JSON.stringify(lines())).not.toMatch(/Golden Eagle|insert into/);
  });

  it('logs nothing for errors maskError maps to a code', () => {
    const { logger, lines } = captureLogs();

    logUnexpectedErrors(logger, [
      new GraphQLError('Syntax Error: Expected Name, found <EOF>.'),
      thrownByResolver(badUserInput([{ path: ['zipCode'], message: 'must be 5 digits' }])),
      thrownByResolver(new WeatherUnavailableError({ cause: { status: 500 } })),
    ]);

    expect(lines()).toEqual([]);
  });
});
