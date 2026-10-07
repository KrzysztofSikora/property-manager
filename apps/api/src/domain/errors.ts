import { stateName } from '@property-manager/shared';
import type { ErrorCode, StateCode } from '@property-manager/shared';

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

const MAX_REGION_LENGTH = 100;

// `region` is third-party text echoed to the client, so it is trimmed and length-bounded.
export class WeatherLocationMismatchError extends DomainError {
  override name = 'WeatherLocationMismatchError';
  readonly code = 'WEATHER_LOCATION_MISMATCH';
  readonly state: StateCode;
  readonly region: string;

  constructor(state: StateCode, region: string, options?: ErrorOptions) {
    const shown = region.trim().slice(0, MAX_REGION_LENGTH);
    super(
      `Weatherstack placed this address in "${shown}", not in ${state} (${stateName(state)}). The property was not saved.`,
      options,
    );
    this.state = state;
    this.region = shown;
  }
}
