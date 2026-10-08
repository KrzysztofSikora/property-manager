import { expect, test } from '@playwright/test';
import { fountainHills, submitCreateForm, uniqueStreet } from './helpers.ts';

// `CREATE_ERROR_MESSAGES.WEATHER_QUOTA_EXCEEDED` in apps/web/src/lib/graphql-errors.ts. Copied,
// not imported: the web sources resolve with the bundler, this project with nodenext.
const QUOTA_MESSAGE =
  'The Weatherstack usage limit has been reached, so the property was not saved. Upgrade the plan or replace the API key.';

// TR-24 error journey: the stub returns error 104 for a query containing QUOTA (e2e/stub).
test('a Weatherstack quota error shows its message and keeps the values', async ({ page }) => {
  const address = fountainHills(`${uniqueStreet()} QUOTA`);

  await submitCreateForm(page, address);

  await expect(page.getByRole('alert')).toHaveText(QUOTA_MESSAGE);
  await expect(page).toHaveURL(/\/properties\/new$/);
  await expect(page.getByLabel('Street')).toHaveValue(address.street);
  await expect(page.getByLabel('City')).toHaveValue(address.city);
  await expect(page.getByLabel('State')).toHaveValue(address.state);
  await expect(page.getByLabel('Zip code')).toHaveValue(address.zipCode);
});
