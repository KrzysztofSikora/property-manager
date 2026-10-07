import { z } from 'zod';
import type { TypedDocumentString } from '../graphql/graphql';

const graphQLErrorSchema = z.object({
  message: z.string(),
  extensions: z.record(z.string(), z.unknown()).optional(),
});

const responseSchema = z.object({
  data: z.unknown().optional(),
  errors: z.array(graphQLErrorSchema).optional(),
});

export type GraphQLErrorEntry = z.infer<typeof graphQLErrorSchema>;

export class GraphQLRequestError extends Error {
  readonly status: number;
  readonly errors: readonly GraphQLErrorEntry[];

  constructor(status: number, errors: readonly GraphQLErrorEntry[]) {
    super(errors[0]?.message ?? `GraphQL request failed with HTTP ${String(status)}`);
    this.name = 'GraphQLRequestError';
    this.status = status;
    this.errors = errors;
  }
}

// A GraphQL `data` payload is always an object. Its fields are typed by the codegen document,
// which the schema guarantees, so the runtime check stops at the object shape.
function isResultOf<TResult>(
  _document: TypedDocumentString<TResult, never>,
  data: unknown,
): data is TResult {
  return typeof data === 'object' && data !== null;
}

export async function execute<TResult, TVariables>(
  document: TypedDocumentString<TResult, TVariables>,
  ...[variables]: TVariables extends Record<string, never> ? [] : [TVariables]
): Promise<TResult> {
  const response = await fetch('/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/graphql-response+json, application/json',
    },
    body: JSON.stringify({ query: document.toString(), variables }),
  });

  const body: unknown = await response.json().catch(() => undefined);
  const parsed = responseSchema.safeParse(body);
  const errors = parsed.success ? (parsed.data.errors ?? []) : [];

  const data = parsed.success ? parsed.data.data : undefined;

  if (!response.ok || errors.length > 0 || !isResultOf(document, data)) {
    throw new GraphQLRequestError(response.status, errors);
  }
  return data;
}
