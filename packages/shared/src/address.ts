import { z } from 'zod';
import { isStateCode } from './states.ts';

/** Trims and collapses every run of whitespace to one space. Case is kept for display. */
export function normalizeAddressText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

// Messages never echo the input (FR-10): they may end up in logs and API errors.
export const addressSchema = z.object({
  street: z
    .string()
    .overwrite(normalizeAddressText)
    .min(1, 'must not be empty')
    .max(200, 'must be at most 200 characters'),
  city: z
    .string()
    .overwrite(normalizeAddressText)
    .min(1, 'must not be empty')
    .max(100, 'must be at most 100 characters'),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .transform((value, ctx) => {
      if (isStateCode(value)) return value;
      ctx.issues.push({
        code: 'custom',
        message: 'must be a 2-letter US state code (50 states or DC)',
        input: value,
      });
      return z.NEVER;
    }),
  zipCode: z.string().regex(/^[0-9]{5}$/, 'must be 5 digits'),
});

export type AddressInput = z.input<typeof addressSchema>;
export type Address = z.output<typeof addressSchema>;

/** For callers that have already validated: throws a ZodError on invalid input. */
export function normalizeAddress(input: AddressInput): Address {
  return addressSchema.parse(input);
}
