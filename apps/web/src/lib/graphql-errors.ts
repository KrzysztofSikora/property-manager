import { type AddressInput, ERROR_CODES, type ErrorCode } from '@property-manager/shared';
import { z } from 'zod';
import { GraphQLRequestError } from './execute';

function isErrorCode(value: unknown): value is ErrorCode {
  return ERROR_CODES.some((code) => code === value);
}

// The FR-10 `extensions.code` of a failed request, or undefined for a network or HTTP failure
// and for codes outside the contract.
export function errorCode(error: unknown): ErrorCode | undefined {
  if (!(error instanceof GraphQLRequestError)) return undefined;
  const code = error.errors[0]?.extensions?.code;
  return isErrorCode(code) ? code : undefined;
}

// One create-form message per code (NFR-09, TR-19). The wording is for the create form only.
// `PROPERTY_NOT_FOUND` is never returned by the create mutation; it keeps the record complete.
export const CREATE_ERROR_MESSAGES: Record<ErrorCode, string> = {
  BAD_USER_INPUT: 'Some fields are invalid. Check the highlighted fields.',
  PROPERTY_ALREADY_EXISTS: 'A property with this address already exists.',
  PROPERTY_NOT_FOUND: 'This property no longer exists.',
  WEATHER_QUOTA_EXCEEDED:
    'The Weatherstack usage limit has been reached, so the property was not saved. Upgrade the plan or replace the API key.',
  WEATHER_UNAVAILABLE:
    'Weather could not be fetched, so the property was not saved. Try again later.',
  WEATHER_LOCATION_MISMATCH:
    'Weatherstack placed this address in a different state, so the property was not saved.',
  INTERNAL_SERVER_ERROR: 'Something went wrong, the property was not saved. Try again.',
};

// Only the API's mismatch message names the region Weatherstack returned (FR-10), so it is
// shown as it is; the table entry covers a missing message. Anything outside the contract
// (network, HTTP, unknown code) gets the generic message.
export function createErrorMessage(error: unknown): string {
  const code = errorCode(error);
  if (code === undefined) return CREATE_ERROR_MESSAGES.INTERNAL_SERVER_ERROR;
  if (code === 'WEATHER_LOCATION_MISMATCH' && error instanceof GraphQLRequestError) {
    const message = error.errors[0]?.message.trim();
    if (message) return message;
  }
  return CREATE_ERROR_MESSAGES[code];
}

export type AddressField = keyof AddressInput;

const ADDRESS_FIELDS: readonly AddressField[] = ['street', 'city', 'state', 'zipCode'];

function isAddressField(value: string): value is AddressField {
  return ADDRESS_FIELDS.some((field) => field === value);
}

const fieldsSchema = z.array(z.object({ field: z.string(), message: z.string() }));

// The `extensions.fields` of a BAD_USER_INPUT error, keyed by address field. Unknown fields are
// dropped and a malformed list gives `{}`, so the caller falls back to a form-level message.
export function fieldErrors(error: unknown): Partial<Record<AddressField, string>> {
  if (!(error instanceof GraphQLRequestError) || errorCode(error) !== 'BAD_USER_INPUT') return {};
  const parsed = fieldsSchema.safeParse(error.errors[0]?.extensions?.fields);
  if (!parsed.success) return {};
  const result: Partial<Record<AddressField, string>> = {};
  for (const { field, message } of parsed.data) {
    if (isAddressField(field) && result[field] === undefined) result[field] = message;
  }
  return result;
}
