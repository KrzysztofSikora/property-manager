import type { Logger } from 'pino';
import { WeatherUnavailableError } from '../../domain/errors.ts';
import type { WeatherClient } from '../../domain/ports.ts';
import { redactText, redactUrl } from './redact.ts';
import { parseWeatherstackResponse } from './response.ts';

export type WeatherstackClientOptions = {
  baseUrl: string;
  accessKey: string;
  logger: Logger;
  fetch?: typeof globalThis.fetch;
};

const TIMEOUT_MS = 5000;

type ErrorSummary = { name: string; message: string };

// Only a redacted name and message: a fetch error's message or cause may quote the URL.
function summarize(error: unknown, accessKey: string): ErrorSummary {
  if (error instanceof Error) {
    return { name: error.name, message: redactText(error.message, accessKey) };
  }
  return { name: 'UnknownError', message: 'A non-Error value was thrown.' };
}

// One attempt per call, no retry: every request spends quota. S-02 classifies the failures.
export function createWeatherstackClient({
  baseUrl,
  accessKey,
  logger,
  fetch = globalThis.fetch,
}: WeatherstackClientOptions): WeatherClient {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

  return {
    async current(query) {
      const url = new URL('current', base);
      url.searchParams.set('access_key', accessKey);
      url.searchParams.set('query', query);
      url.searchParams.set('units', 'f');
      const loggedUrl = redactUrl(url);

      function unavailable(details: Record<string, unknown>, message: string): never {
        logger.warn({ url: loggedUrl, ...details }, message);
        throw new WeatherUnavailableError({ cause: details });
      }

      let response: Response;
      try {
        response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      } catch (error) {
        unavailable({ error: summarize(error, accessKey) }, 'Weatherstack request failed');
      }

      if (!response.ok) {
        await response.body?.cancel();
        unavailable({ status: response.status }, 'Weatherstack returned an error status');
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch (error) {
        unavailable({ error: summarize(error, accessKey) }, 'Weatherstack returned invalid JSON');
      }

      try {
        return parseWeatherstackResponse(body);
      } catch (error) {
        if (error instanceof WeatherUnavailableError) {
          logger.warn({ url: loggedUrl, cause: error.cause }, 'Weatherstack response rejected');
        }
        throw error;
      }
    },
  };
}
