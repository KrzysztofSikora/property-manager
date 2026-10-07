import type { Logger } from 'pino';
import { WeatherQuotaExceededError, WeatherUnavailableError } from '../../domain/errors.ts';
import type { WeatherClient } from '../../domain/ports.ts';
import { redactText, redactUrl } from './redact.ts';
import { parseWeatherstackResponse } from './response.ts';

export type WeatherstackClientOptions = {
  baseUrl: string;
  accessKey: string;
  logger: Logger;
  fetch?: typeof globalThis.fetch;
  // Tests inject a short one (TR-10); production uses the default.
  timeoutMs?: number;
};

export const DEFAULT_TIMEOUT_MS = 5000;

type ErrorSummary = { name: string; message: string };

// Only a redacted name and message: a fetch error's message or cause may quote the URL.
function summarize(error: unknown, accessKey: string): ErrorSummary {
  if (error instanceof Error) {
    return { name: error.name, message: redactText(error.message, accessKey) };
  }
  return { name: 'UnknownError', message: 'A non-Error value was thrown.' };
}

// One attempt per call, no retry: every request spends quota.
export function createWeatherstackClient({
  baseUrl,
  accessKey,
  logger,
  fetch = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
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
        response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
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
        // Quota and configuration errors need the operator, so they log at `error` (FR-06 AC6).
        const details = { url: loggedUrl, cause: error instanceof Error ? error.cause : undefined };
        if (error instanceof WeatherQuotaExceededError) {
          logger.error(details, 'Weatherstack usage limit reached');
        } else if (error instanceof WeatherUnavailableError && error.reason === 'configuration') {
          logger.error(details, 'Weatherstack configuration error');
        } else if (error instanceof WeatherUnavailableError) {
          logger.warn(details, 'Weatherstack response rejected');
        }
        throw error;
      }
    },
  };
}
