import { HttpResponse } from 'msw/http';
import { describe, expect, it } from 'vitest';
import { HealthDocument } from '../graphql/graphql';
import { api, server } from '../test/msw';
import { execute, GraphQLRequestError } from './execute';

describe('execute', () => {
  it('returns the data of a successful response', async () => {
    await expect(execute(HealthDocument)).resolves.toEqual({ health: 'ok' });
  });

  it('throws GraphQLRequestError with the errors of an errors payload', async () => {
    server.use(
      api.query('Health', () =>
        HttpResponse.json({ errors: [{ message: 'boom', extensions: { code: 'X' } }] }),
      ),
    );

    const error = await execute(HealthDocument).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GraphQLRequestError);
    expect(error).toMatchObject({
      status: 200,
      errors: [{ message: 'boom', extensions: { code: 'X' } }],
    });
  });

  it('throws GraphQLRequestError with the status on HTTP 500', async () => {
    server.use(api.query('Health', () => new Response('down', { status: 500 })));

    const error = await execute(HealthDocument).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GraphQLRequestError);
    expect(error).toMatchObject({ status: 500, errors: [] });
  });

  it('sends the operation as a POST to /graphql', async () => {
    let seen: { method: string; path: string } | undefined;
    server.use(
      api.query('Health', ({ request }) => {
        seen = { method: request.method, path: new URL(request.url).pathname };
        return HttpResponse.json({ data: { health: 'ok' } });
      }),
    );

    await execute(HealthDocument);

    expect(seen).toEqual({ method: 'POST', path: '/graphql' });
  });
});
