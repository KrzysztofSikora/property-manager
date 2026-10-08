import { z } from 'zod';
import type { SeedAddress } from './addresses.ts';

// README: two Weatherstack calls within about a second can return HTTP 429.
const SPACING_MS = 1500;

const CREATE_PROPERTY = /* GraphQL */ `
  mutation SeedProperty($street: String!, $city: String!, $state: String!, $zipCode: String!) {
    createProperty(street: $street, city: $city, state: $state, zipCode: $zipCode) {
      id
      street
      city
      state
      zipCode
    }
  }
`;

// Any `code` string: Yoga's own errors (e.g. GRAPHQL_VALIDATION_FAILED) are outside the FR-10
// contract, and their message is what a reviewer needs after schema drift.
const resultSchema = z.object({
  data: z
    .object({
      createProperty: z
        .object({
          id: z.string(),
          street: z.string(),
          city: z.string(),
          state: z.string(),
          zipCode: z.string(),
        })
        .nullable(),
    })
    .nullish(),
  errors: z
    .array(
      z.object({
        message: z.string(),
        extensions: z.object({ code: z.string().optional() }).nullish(),
      }),
    )
    .optional(),
});

type Outcome = { kind: 'created' } | { kind: 'exists' } | { kind: 'failed'; reason: string };

export type SeedDeps = {
  apiUrl: string;
  addresses: readonly SeedAddress[];
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  sleep: (ms: number) => Promise<void>;
  stdout: (line: string) => void;
  stderr: (line: string) => void;
};

function label({ street, city, state, zipCode }: SeedAddress): string {
  return `${street}, ${city}, ${state} ${zipCode}`;
}

async function bodyOf(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

// Classified from the body whatever the status: Yoga answers a validation error with a 4xx and
// a GraphQL `errors` body, whose message says more than the status.
async function classify(response: Response): Promise<Outcome> {
  const result = resultSchema.safeParse(await bodyOf(response));
  if (result.success) {
    const [error] = result.data.errors ?? [];
    if (error !== undefined) {
      const code = error.extensions?.code;
      if (code === 'PROPERTY_ALREADY_EXISTS') return { kind: 'exists' };
      return { kind: 'failed', reason: `${code ?? 'no code'}: ${error.message}` };
    }
    if (result.data.data?.createProperty) return { kind: 'created' };
  }
  return {
    kind: 'failed',
    reason: response.ok ? 'unexpected response' : `HTTP ${String(response.status)}`,
  };
}

async function create(deps: SeedDeps, address: SeedAddress): Promise<Outcome> {
  let response: Response;
  try {
    response = await deps.fetch(deps.apiUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: CREATE_PROPERTY, variables: { ...address } }),
    });
  } catch {
    // The URL holds no secret; the fetch error adds nothing a reviewer can act on.
    return { kind: 'failed', reason: `could not reach ${deps.apiUrl}` };
  }
  return classify(response);
}

/**
 * Creates each address through the `createProperty` mutation of a running API, in order.
 * An existing address is skipped (no Weatherstack call); any other failure stops the run,
 * since a key or quota error would repeat for every address. Never throws for those.
 */
export async function runSeed(deps: SeedDeps): Promise<0 | 1> {
  let created = 0;
  let skipped = 0;
  for (const [index, address] of deps.addresses.entries()) {
    const outcome = await create(deps, address);
    if (outcome.kind === 'failed') {
      deps.stderr(`failed: ${label(address)}: ${outcome.reason}`);
      return 1;
    }
    if (outcome.kind === 'exists') {
      skipped += 1;
      deps.stdout(`skipped (already exists): ${label(address)}`);
      continue;
    }
    created += 1;
    deps.stdout(`created: ${label(address)}`);
    if (index < deps.addresses.length - 1) await deps.sleep(SPACING_MS);
  }
  deps.stdout(`${String(created)} created, ${String(skipped)} skipped`);
  return 0;
}
