import { HttpResponse } from 'msw/http';
import { describe, expect, it } from 'vitest';
import { HealthDocument } from '../graphql/graphql';
import { api, server } from '../test/msw';
import { execute, GraphQLRequestError } from './execute';

describe('execute', () => {
  it('returns the data of a successful response', async () => {
    await expect(execute(HealthDocument)).resolves.toEqual({ health: 'ok' });
  });

  it.each([
    ['without data', undefined],
    ['with partial data', { health: null }],
  ])('throws GraphQLRequestError for an errors payload %s', async (_name, data) => {
    server.use(
      api.query('Health', () =>
        HttpResponse.json({ data, errors: [{ message: 'boom', extensions: { code: 'X' } }] }),
      ),
    );

    const error = await execute(HealthDocument).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GraphQLRequestError);
    expect(error).toMatchObject({
      message: 'boom',
      status: 200,
      errors: [{ message: 'boom', extensions: { code: 'X' } }],
    });
  });

  it.each([
    ['a non-JSON body', 500, () => new Response('down', { status: 500 })],
    ['a data payload', 502, () => HttpResponse.json({ data: { health: 'ok' } }, { status: 502 })],
  ])(
    'throws GraphQLRequestError with the status on an HTTP error with %s',
    async (_name, status, reply) => {
      server.use(api.query('Health', reply));

      const error = await execute(HealthDocument).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(GraphQLRequestError);
      expect(error).toMatchObject({ status, errors: [] });
      expect(error instanceof Error && error.message).toContain(`HTTP ${String(status)}`);
    },
  );

  it.each([
    ['an empty object', () => HttpResponse.json({})],
    ['null data', () => HttpResponse.json({ data: null })],
    ['a non-JSON body', () => new Response('ok', { status: 200 })],
  ])('throws GraphQLRequestError on HTTP 200 with %s', async (_name, reply) => {
    server.use(api.query('Health', reply));

    const error = await execute(HealthDocument).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GraphQLRequestError);
    expect(error).toMatchObject({ status: 200, errors: [] });
  });

  it('sends the operation as a JSON POST to /graphql', async () => {
    let seen:
      | { method: string; path: string; contentType: string | null; accept: string | null }
      | undefined;
    server.use(
      api.query('Health', ({ request }) => {
        seen = {
          method: request.method,
          path: new URL(request.url).pathname,
          contentType: request.headers.get('content-type'),
          accept: request.headers.get('accept'),
        };
        return HttpResponse.json({ data: { health: 'ok' } });
      }),
    );

    await execute(HealthDocument);

    expect(seen).toMatchObject({
      method: 'POST',
      path: '/graphql',
      contentType: 'application/json',
    });
    expect(seen?.accept).toContain('application/graphql-response+json');
  });
});
