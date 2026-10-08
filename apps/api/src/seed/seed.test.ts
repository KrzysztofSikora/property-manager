import { ERROR_CODES } from '@property-manager/shared';
import { http, HttpResponse } from 'msw/http';
import { describe, expect, it } from 'vitest';
import { server } from '../../test/setup/msw.ts';
import type { SeedAddress } from './addresses.ts';
import { runSeed } from './seed.ts';

const API_URL = 'http://seed.test/graphql';

const ADDRESSES: readonly SeedAddress[] = [
  { street: '1 First St', city: 'Denver', state: 'CO', zipCode: '80203' },
  { street: '2 Second St', city: 'Austin', state: 'TX', zipCode: '78701' },
  { street: '3 Third St', city: 'Seattle', state: 'WA', zipCode: '98109' },
];
const SECOND = '2 Second St, Austin, TX 78701';

type Sent = { contentType: string | null; query: string; variables: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function created(variables: unknown): Response {
  const address = isRecord(variables) ? variables : {};
  return HttpResponse.json({ data: { createProperty: { id: 'id-1', ...address } } });
}

function graphQLError(message: string, extensions?: Record<string, unknown>): object {
  return {
    data: { createProperty: null },
    errors: [{ message, path: ['createProperty'], extensions }],
  };
}

// Answers each request with `respond(index, variables)` and records what was sent.
function api(respond: (index: number, variables: unknown) => Response): Sent[] {
  const sent: Sent[] = [];
  server.use(
    http.post(API_URL, async ({ request }) => {
      const body: unknown = await request.json();
      if (!isRecord(body)) throw new Error('the seed sent a body that is not a JSON object');
      sent.push({
        contentType: request.headers.get('content-type'),
        query: String(body.query),
        variables: body.variables,
      });
      return respond(sent.length - 1, body.variables);
    }),
  );
  return sent;
}

// The 2nd request gets `second`, the others are created.
function secondReturns(second: () => Response): Sent[] {
  return api((index, variables) => (index === 1 ? second() : created(variables)));
}

async function seed(): Promise<{
  code: number;
  stdout: string[];
  stderr: string[];
  sleeps: number[];
}> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const sleeps: number[] = [];
  const code = await runSeed({
    apiUrl: API_URL,
    addresses: ADDRESSES,
    fetch: (url, init) => fetch(url, init),
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
  });
  return { code, stdout, stderr, sleeps };
}

describe('runSeed', () => {
  it('FR-16 AC1: creates every address through createProperty, spaced by 1.5 s', async () => {
    const sent = api((_index, variables) => created(variables));

    const { code, stdout, stderr, sleeps } = await seed();

    expect(code).toBe(0);
    expect(sent.map((request) => request.variables)).toEqual(ADDRESSES);
    for (const request of sent) {
      expect(request.contentType).toBe('application/json');
      expect(request.query).toMatch(/^\s*mutation\b/);
      expect(request.query).toMatch(
        /createProperty\(street: \$street, city: \$city, state: \$state, zipCode: \$zipCode\)/,
      );
    }
    expect(sleeps).toEqual([1500, 1500]);
    expect(stdout).toEqual([
      'created: 1 First St, Denver, CO 80203',
      `created: ${SECOND}`,
      'created: 3 Third St, Seattle, WA 98109',
      '3 created, 0 skipped',
    ]);
    expect(stderr).toEqual([]);
  });

  it('FR-16 AC1: skips an existing address for free and goes on', async () => {
    const sent = secondReturns(() =>
      HttpResponse.json(
        graphQLError('A property with this address already exists.', {
          code: 'PROPERTY_ALREADY_EXISTS',
        }),
      ),
    );

    const { code, stdout, stderr, sleeps } = await seed();

    expect(code).toBe(0);
    expect(sent).toHaveLength(3);
    // After the 1st create only: a skip made no Weatherstack call, and the 3rd is the last.
    expect(sleeps).toEqual([1500]);
    expect(stdout).toEqual([
      'created: 1 First St, Denver, CO 80203',
      `skipped (already exists): ${SECOND}`,
      'created: 3 Third St, Seattle, WA 98109',
      '2 created, 1 skipped',
    ]);
    expect(stderr).toEqual([]);
  });

  it.each(ERROR_CODES.filter((code) => code !== 'PROPERTY_ALREADY_EXISTS'))(
    'FR-16 AC1: stops at %s, naming the address and the code',
    async (errorCode) => {
      const sent = secondReturns(() =>
        HttpResponse.json(graphQLError('Server says no.', { code: errorCode })),
      );

      const { code, stdout, stderr } = await seed();

      expect(code).toBe(1);
      expect(sent).toHaveLength(2);
      expect(stderr).toEqual([`failed: ${SECOND}: ${errorCode}: Server says no.`]);
      expect(stdout).toEqual(['created: 1 First St, Denver, CO 80203']);
    },
  );

  it('stops at a code outside the contract and shows its message', async () => {
    const sent = secondReturns(() =>
      HttpResponse.json({
        errors: [
          {
            message: 'Cannot query field "createProperty" on type "Mutation".',
            extensions: { code: 'GRAPHQL_VALIDATION_FAILED' },
          },
        ],
      }),
    );

    const { code, stderr } = await seed();

    expect(code).toBe(1);
    expect(sent).toHaveLength(2);
    expect(stderr).toEqual([
      `failed: ${SECOND}: GRAPHQL_VALIDATION_FAILED: Cannot query field "createProperty" on type "Mutation".`,
    ]);
  });

  it.each([
    ['no extensions', undefined],
    ['extensions without a code', { http: { status: 500 } }],
  ])('stops at an error with %s and shows its message', async (_case, extensions) => {
    secondReturns(() => HttpResponse.json(graphQLError('Unexpected error.', extensions)));

    const { code, stderr } = await seed();

    expect(code).toBe(1);
    expect(stderr).toEqual([`failed: ${SECOND}: no code: Unexpected error.`]);
  });

  it('reports the first error when there are several', async () => {
    secondReturns(() =>
      HttpResponse.json({
        errors: [
          { message: 'First.', extensions: { code: 'BAD_USER_INPUT' } },
          { message: 'Second.', extensions: { code: 'PROPERTY_ALREADY_EXISTS' } },
        ],
      }),
    );

    const { code, stderr } = await seed();

    expect(code).toBe(1);
    expect(stderr).toEqual([`failed: ${SECOND}: BAD_USER_INPUT: First.`]);
  });

  it('reports the GraphQL error of a non-2xx response, not only its status', async () => {
    secondReturns(() =>
      HttpResponse.json(
        {
          errors: [
            {
              message: 'Variable "$zipCode" got invalid value.',
              extensions: { code: 'BAD_USER_INPUT' },
            },
          ],
        },
        { status: 400 },
      ),
    );

    const { code, stderr } = await seed();

    expect(code).toBe(1);
    expect(stderr).toEqual([
      `failed: ${SECOND}: BAD_USER_INPUT: Variable "$zipCode" got invalid value.`,
    ]);
  });

  it.each([
    [
      'HTTP 500 with a non-GraphQL body',
      () => HttpResponse.text('Bad gateway', { status: 500 }),
      'HTTP 500',
    ],
    [
      'HTTP 502 with an empty JSON object',
      () => HttpResponse.json({}, { status: 502 }),
      'HTTP 502',
    ],
    [
      'HTTP 200 with a body that is not JSON',
      () => HttpResponse.text('<html>'),
      'unexpected response',
    ],
    [
      'HTTP 200 with a body that is not a GraphQL result',
      () => HttpResponse.json({ ok: true }),
      'unexpected response',
    ],
    [
      'HTTP 200 with an empty errors list',
      () => HttpResponse.json({ errors: [] }),
      'unexpected response',
    ],
    [
      'createProperty null without errors',
      () => HttpResponse.json({ data: { createProperty: null } }),
      'unexpected response',
    ],
    [
      'a property without an id',
      () => HttpResponse.json({ data: { createProperty: { street: '2 Second St' } } }),
      'unexpected response',
    ],
    ['a network error', () => HttpResponse.error(), `could not reach ${API_URL}`],
  ])('stops at %s with its own reason', async (_case, respond, reason) => {
    const sent = secondReturns(respond);

    const { code, stdout, stderr } = await seed();

    expect(code).toBe(1);
    expect(sent).toHaveLength(2);
    expect(stderr).toEqual([`failed: ${SECOND}: ${reason}`]);
    expect(stdout).toEqual(['created: 1 First St, Denver, CO 80203']);
  });

  it('prints an empty summary for an empty list', async () => {
    const stdout: string[] = [];

    const code = await runSeed({
      apiUrl: API_URL,
      addresses: [],
      fetch: () => Promise.reject(new Error('no request expected')),
      sleep: () => Promise.reject(new Error('no sleep expected')),
      stdout: (line) => stdout.push(line),
      stderr: () => undefined,
    });

    expect(code).toBe(0);
    expect(stdout).toEqual(['0 created, 0 skipped']);
  });
});
