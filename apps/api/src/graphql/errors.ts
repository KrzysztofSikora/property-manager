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

type Classified =
  | { kind: 'graphql'; error: GraphQLError }
  | { kind: 'domain'; cause: DomainError }
  | { kind: 'unexpected'; cause: unknown };

function classify(error: unknown): Classified {
  const cause = rootCause(error);
  // Parse and validation errors, and a resolver-thrown BAD_USER_INPUT, whose wrapper already
  // carries the inner `extensions`.
  if (error instanceof GraphQLError && cause instanceof GraphQLError)
    return { kind: 'graphql', error };
  if (cause instanceof DomainError) return { kind: 'domain', cause };
  return { kind: 'unexpected', cause };
}

// Keeps `locations` and `path` from the wrapper, as Yoga's own maskError does.
function located(error: unknown): GraphQLErrorOptions {
  if (!(error instanceof GraphQLError)) return {};
  const { nodes, source, positions, path } = error;
  return { nodes, source, positions, path };
}

// The single place that maps errors to `extensions.code` (FR-10, TR-12). It never forwards
// `isDev`: Yoga's default adds the original message and stack in development. It does not log:
// it has no request context, so `logUnexpectedErrors` logs from the operation plugin instead.
export const maskError: MaskError = (error, message) => {
  const classified = classify(error);
  if (classified.kind === 'graphql') return classified.error;
  if (classified.kind === 'domain') {
    return new GraphQLError(classified.cause.message, {
      ...located(error),
      extensions: { code: classified.cause.code },
    });
  }
  return new GraphQLError(message, {
    ...located(error),
    extensions: { code: 'INTERNAL_SERVER_ERROR' },
  });
};

export type ErrorSummary = {
  name: string;
  code?: string;
  constraint?: string;
  frames?: string[];
  cause?: ErrorSummary;
};

const MAX_CAUSE_DEPTH = 5;

function stringField(error: Error, key: 'code' | 'constraint'): string | undefined {
  const value: unknown = Reflect.get(error, key);
  return typeof value === 'string' ? value : undefined;
}

// What is safe to log about an unexpected error: name, pg `code` / `constraint` and stack frames,
// down the `cause` chain. No message, `query`, `params` or `detail`: a database error quotes the
// insert, so those carry the user's address and the weather payload.
export function summarizeError(error: unknown, depth = 0): ErrorSummary {
  if (!(error instanceof Error)) return { name: error === null ? 'null' : typeof error };
  const summary: ErrorSummary = { name: error.name };
  const code = stringField(error, 'code');
  if (code !== undefined) summary.code = code;
  const constraint = stringField(error, 'constraint');
  if (constraint !== undefined) summary.constraint = constraint;
  const frames = error.stack?.split('\n').filter((line) => /^\s+at /.test(line));
  if (frames !== undefined && frames.length > 0) summary.frames = frames.map((f) => f.trim());
  if (error.cause !== undefined && depth < MAX_CAUSE_DEPTH) {
    summary.cause = summarizeError(error.cause, depth + 1);
  }
  return summary;
}

// Logs, as a summary, every error that `maskError` turns into INTERNAL_SERVER_ERROR. Called with
// the request's logger, so the line carries its `requestId`.
export function logUnexpectedErrors(logger: Logger, errors: readonly unknown[]): void {
  for (const error of errors) {
    const classified = classify(error);
    if (classified.kind === 'unexpected') {
      logger.error({ error: summarizeError(classified.cause) }, 'unexpected error');
    }
  }
}
