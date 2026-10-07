import { GraphQLError } from 'graphql';
import type { GraphQLErrorOptions } from 'graphql';
import type { MaskError } from 'graphql-yoga';
import type { Logger } from 'pino';
import { DomainError } from '../domain/errors.ts';

// The part of a zod issue this module reads, so callers pass `result.error.issues` as they are.
export type InputIssue = { readonly path: readonly PropertyKey[]; readonly message: string };

export type FieldError = { field: string; message: string };

// One error for the whole input (FR-07 AC5): every invalid field, with its first issue.
export function badUserInput(issues: readonly InputIssue[]): GraphQLError {
  const fields: FieldError[] = [];
  for (const issue of issues) {
    const field = issue.path.map(String).join('.');
    if (!fields.some((entry) => entry.field === field)) {
      fields.push({ field, message: issue.message });
    }
  }
  const summary = fields.map(({ field, message }) => `${field} (${message})`).join(', ');
  return new GraphQLError(`Invalid input: ${summary}`, {
    extensions: { code: 'BAD_USER_INPUT', fields },
  });
}

// graphql 17 wraps whatever a resolver throws in a located GraphQLError (`cause` = the thrown
// value), so the error to classify is the first one in the chain that is not a GraphQLError.
function rootCause(error: unknown): unknown {
  let current = error;
  while (current instanceof GraphQLError && current.cause !== undefined) {
    current = current.cause;
  }
  return current;
}

// Keeps `locations` and `path` from the wrapper, as Yoga's own maskError does.
function located(error: unknown): GraphQLErrorOptions {
  if (!(error instanceof GraphQLError)) return {};
  const { nodes, source, positions, path } = error;
  return { nodes, source, positions, path };
}

// The single place that maps errors to `extensions.code` (FR-10, TR-12). It never forwards
// `isDev`: Yoga's default adds the original message and stack in development.
export function createMaskError(logger: Logger): MaskError {
  return (error, message) => {
    const cause = rootCause(error);
    // Parse and validation errors, and a resolver-thrown BAD_USER_INPUT, whose wrapper already
    // carries the inner `extensions`.
    if (error instanceof GraphQLError && cause instanceof GraphQLError) return error;
    if (cause instanceof DomainError) {
      return new GraphQLError(cause.message, {
        ...located(error),
        extensions: { code: cause.code },
      });
    }
    logger.error({ err: cause }, 'unexpected error');
    return new GraphQLError(message, {
      ...located(error),
      extensions: { code: 'INTERNAL_SERVER_ERROR' },
    });
  };
}
