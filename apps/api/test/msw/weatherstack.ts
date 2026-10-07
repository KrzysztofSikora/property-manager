import { delay } from 'msw';
import { http, HttpResponse } from 'msw/http';
import type { HttpHandler } from 'msw/http';
import { weatherstackResponse } from '../fixtures/weatherstack.ts';
import type { JsonObject } from '../fixtures/weatherstack.ts';

// Any host, so the handlers also serve the default `WEATHERSTACK_BASE_URL` in app tests.
const CURRENT = '*/current';

// Install with `server.use(handler)`. `requests` holds every URL the handler served, so a test
// asserts the query and the count. Compare `access_key` to the sentinel; never print it.
export type RecordingHandler = { handler: HttpHandler; requests: URL[] };

function recording(respond: () => Response | Promise<Response>): RecordingHandler {
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
  // Never responds: only the client's timeout ends the request (FR-06 AC3).
  hang: () =>
    recording(async () => {
      await delay('infinite');
      return HttpResponse.error();
    }),
  // HTTP 200 with a body that is not JSON.
  text: (body: string) => recording(() => HttpResponse.text(body)),
};
