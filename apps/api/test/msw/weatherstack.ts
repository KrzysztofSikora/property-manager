import { http, HttpResponse } from 'msw/http';
import type { HttpHandler } from 'msw/http';
import { weatherstackResponse } from '../fixtures/weatherstack.ts';
import type { JsonObject } from '../fixtures/weatherstack.ts';

// Any host, so the handlers also serve the default `WEATHERSTACK_BASE_URL` in app tests.
const CURRENT = '*/current';

// Install with `server.use(handler)`. `requests` holds every URL the handler served, so a test
// asserts the query and the count. Compare `access_key` to the sentinel; never print it.
export type RecordingHandler = { handler: HttpHandler; requests: URL[] };

function recording(respond: () => Response): RecordingHandler {
  const requests: URL[] = [];
  const handler = http.get(CURRENT, ({ request }) => {
    requests.push(new URL(request.url));
    return respond();
  });
  return { handler, requests };
}

export const weatherstackHandlers = {
  // HTTP 200 with the recorded sample. Pass `weatherstackError(...)` for an API error body.
  ok: (body: JsonObject = weatherstackResponse()) => recording(() => HttpResponse.json(body)),
  status: (status: number, body: JsonObject = {}) =>
    recording(() => HttpResponse.json(body, { status })),
  networkError: () => recording(() => HttpResponse.error()),
};
