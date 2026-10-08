import type { Page } from '@playwright/test';

// A street no other run has used, so the duplicate check (FR-08) never trips a re-run.
export function uniqueStreet(): string {
  const suffix = `${String(Date.now())}${String(Math.floor(Math.random() * 1000))}`;
  return `${suffix} E2E Way`;
}

export type AddressForm = { street: string; city: string; state: string; zipCode: string };

// A Fountain Hills address: the stub's sample is region Arizona, so the region check passes.
export function fountainHills(street: string): AddressForm {
  return { street, city: 'Fountain Hills', state: 'AZ', zipCode: '85268' };
}

export async function submitCreateForm(page: Page, address: AddressForm): Promise<void> {
  await page.goto('/properties/new');
  await page.getByLabel('Street').fill(address.street);
  await page.getByLabel('City').fill(address.city);
  await page.getByLabel('State').fill(address.state);
  await page.getByLabel('Zip code').fill(address.zipCode);
  await page.getByRole('button', { name: 'Create property' }).click();
}
