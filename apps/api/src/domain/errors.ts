import type { ErrorCode } from '@property-manager/shared';

// An expected failure with a client-facing code. The message is safe to show as it is.
export abstract class DomainError extends Error {
  abstract readonly code: ErrorCode;
}

// `configuration`: Weatherstack rejected the key or the plan, so the operator must act. The
// client sees the same code either way; only the log level differs.
export type WeatherFailureReason = 'configuration' | 'upstream';

export type WeatherUnavailableOptions = ErrorOptions & { reason?: WeatherFailureReason };

export class WeatherUnavailableError extends DomainError {
  override name = 'WeatherUnavailableError';
  readonly code = 'WEATHER_UNAVAILABLE';
  readonly reason: WeatherFailureReason;

  constructor({ reason = 'upstream', ...options }: WeatherUnavailableOptions = {}) {
    super('Weather could not be fetched, so the property was not saved. Try again later.', options);
    this.reason = reason;
  }
}

export class WeatherQuotaExceededError extends DomainError {
  override name = 'WeatherQuotaExceededError';
  readonly code = 'WEATHER_QUOTA_EXCEEDED';

  constructor(options?: ErrorOptions) {
    super(
      'The Weatherstack usage limit has been reached, so the property was not saved. Upgrade the Weatherstack plan or replace the API key.',
      options,
    );
  }
}
