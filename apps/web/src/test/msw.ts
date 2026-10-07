import { graphql } from 'msw/graphql';
import { HttpResponse } from 'msw/http';
import { setupServer } from 'msw/node';

// MSW 3 scopes GraphQL handlers to an endpoint. Relative to the jsdom origin, like the app.
export const api = graphql.link('/graphql');

// Default: the API is up. Tests override per case with `server.use(...)`.
export const handlers = [api.query('Health', () => HttpResponse.json({ data: { health: 'ok' } }))];

export const server = setupServer(...handlers);
