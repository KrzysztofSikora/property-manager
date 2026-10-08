import { ERROR_CODES, type ErrorCode } from '@property-manager/shared';
import { GraphQLRequestError } from './execute';

function isErrorCode(value: unknown): value is ErrorCode {
  return ERROR_CODES.some((code) => code === value);
}

// The FR-10 `extensions.code` of a failed request, or undefined for a network or HTTP failure
// and for codes outside the contract. S-05 adds the per-code messages here (TR-19).
export function errorCode(error: unknown): ErrorCode | undefined {
  if (!(error instanceof GraphQLRequestError)) return undefined;
  const code = error.errors[0]?.extensions?.code;
  return isErrorCode(code) ? code : undefined;
}
