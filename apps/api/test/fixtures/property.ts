// S-01 replaces this with the type inferred from the address zod schema.
export type PropertyInput = { street: string; city: string; state: string; zipCode: string };

// The PRD's canonical address. Derive other inputs through overrides: "valid input except X".
export function validInput(overrides: Partial<PropertyInput> = {}): PropertyInput {
  return {
    street: '15528 E Golden Eagle Blvd',
    city: 'Fountain Hills',
    state: 'AZ',
    zipCode: '85268',
    ...overrides,
  };
}
