import { graphql } from 'msw/graphql';
import { HttpResponse } from 'msw/http';
import { setupServer } from 'msw/node';

// MSW 3 scopes GraphQL handlers to an endpoint. Relative to the jsdom origin, like the app.
export const api = graphql.link('/graphql');

// Defaults: no properties stored. Tests override per case with `server.use(...)`.
export const handlers = [
  api.query('Properties', () =>
    HttpResponse.json({ data: { properties: { items: [], totalCount: 0 } } }),
  ),
  api.query('Property', () => HttpResponse.json({ data: { property: null } })),
];

export const server = setupServer(...handlers);
