import type { ErrorCode } from '@property-manager/shared';

// An expected failure with a client-facing code. The message is safe to show as it is.
export abstract class DomainError extends Error {
  abstract readonly code: ErrorCode;
}

export class WeatherUnavailableError extends DomainError {
  override name = 'WeatherUnavailableError';
  readonly code = 'WEATHER_UNAVAILABLE';

  constructor(options?: ErrorOptions) {
    super('Weather could not be fetched, so the property was not saved. Try again later.', options);
  }
}
