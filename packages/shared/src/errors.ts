/** GraphQL `extensions.code` values from the FR-10 error contract. */
export const ERROR_CODES = [
  'BAD_USER_INPUT',
  'PROPERTY_ALREADY_EXISTS',
  'PROPERTY_NOT_FOUND',
  'WEATHER_QUOTA_EXCEEDED',
  'WEATHER_UNAVAILABLE',
  'WEATHER_LOCATION_MISMATCH',
  'INTERNAL_SERVER_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
