import type { AddressInput } from '@property-manager/shared';

// The PRD's canonical address. Derive other inputs through overrides: "valid input except X".
export function validInput(overrides: Partial<AddressInput> = {}): AddressInput {
  return {
    street: '15528 E Golden Eagle Blvd',
    city: 'Fountain Hills',
    state: 'AZ',
    zipCode: '85268',
    ...overrides,
  };
}
