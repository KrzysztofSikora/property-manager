import { expect, test } from '@playwright/test';
import { fountainHills, scottsdale, submitCreateForm, uniqueStreet } from './helpers.ts';

// TR-24: the core journey on the Compose stack (FR-14 AC1, success criteria 1–3).
test('create, see weather, find it in the list, filter, delete', async ({ page }) => {
  const street = uniqueStreet();
  const otherStreet = uniqueStreet();

  // An older property in another city, so the list order and the city filter can fail.
  await submitCreateForm(page, scottsdale(otherStreet));
  await expect(page.getByRole('heading', { level: 1, name: otherStreet })).toBeVisible();

  // Create → details with weather and coordinates from the stub's sample.
  await submitCreateForm(page, fountainHills(street));
  // `new` excluded: the form's own URL would match before the redirect.
  await expect(page).toHaveURL(/\/properties\/(?!new$)[^/]+$/);
  const detailsUrl = page.url();
  await expect(page.getByRole('heading', { level: 1, name: street })).toBeVisible();
  await expect(page.getByText('82 °F', { exact: true })).toBeVisible();
  await expect(page.getByText('Clear', { exact: true })).toBeVisible();
  await expect(page.getByText('33.609, -111.729', { exact: true })).toBeVisible();

  // A reload of the deep link goes through the SPA fallback and the API again.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: street })).toBeVisible();

  // List, newest first: the new property is row 1, the older one row 2 (row 0 is the header).
  await page.getByRole('link', { name: 'Properties', exact: true }).click();
  const rows = page.getByRole('row');
  await expect(rows.nth(1).getByRole('link', { name: street })).toBeVisible();
  await expect(rows.nth(2).getByRole('link', { name: otherStreet })).toBeVisible();

  // City filter keeps it and drops the Scottsdale one.
  await page.getByLabel('City').fill('Fountain Hills');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByRole('link', { name: street })).toBeVisible();
  await expect(page.getByRole('link', { name: otherStreet })).toHaveCount(0);

  // Delete with confirm → gone from the list and from its details URL.
  await page.getByRole('button', { name: `Delete ${street}` }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete property?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('link', { name: street })).toHaveCount(0);

  await page.goto(detailsUrl);
  await expect(page.getByRole('heading', { level: 1, name: 'Property not found' })).toBeVisible();
});
