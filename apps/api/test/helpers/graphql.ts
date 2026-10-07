import { expect } from 'vitest';
import type { ExecuteResult } from './app.ts';

export type ResultError = {
  message: string;
  extensions: Record<string, unknown>;
  path?: unknown;
  locations?: unknown;
};

function isResultError(value: unknown): value is ResultError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof value.message === 'string' &&
    'extensions' in value &&
    typeof value.extensions === 'object' &&
    value.extensions !== null
  );
}

// Asserts exactly one error, with `extensions.code` = `code`, and returns it for further checks.
export function expectGraphQLError(result: ExecuteResult, code: string): ResultError {
  expect(result.errors).toHaveLength(1);
  const error = result.errors?.[0];
  if (!isResultError(error)) return expect.fail('expectGraphQLError: not a GraphQL error');
  expect(error.extensions.code).toBe(code);
  return error;
}
