import { expect, it } from 'vitest';

it('TR-25: an unmocked outbound request fails', async () => {
  const error: unknown = await fetch('https://api.weatherstack.com/current').then(
    () => undefined,
    (reason: unknown) => reason,
  );
  // The cause proves MSW blocked it, not an offline network.
  if (!(error instanceof TypeError)) throw new Error('expected fetch to reject with a TypeError');
  expect(String(error.cause)).toContain('onUnhandledFrame');
});
