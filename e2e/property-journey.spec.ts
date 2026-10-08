import { expect, test } from '@playwright/test';
import { fountainHills, submitCreateForm, uniqueStreet } from './helpers.ts';

// TR-24: the core journey on the Compose stack (FR-14 AC1, success criteria 1–3).
test('create, see weather, find it in the list, filter, delete', async ({ page }) => {
  const street = uniqueStreet();

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

  // List, newest first: the new property is the first data row (row 0 is the header).
  await page.getByRole('link', { name: 'Properties', exact: true }).click();
  const firstRow = page.getByRole('row').nth(1);
  await expect(firstRow.getByRole('link', { name: street })).toBeVisible();

  // City filter keeps it.
  await page.getByLabel('City').fill('Fountain Hills');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByRole('link', { name: street })).toBeVisible();

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
