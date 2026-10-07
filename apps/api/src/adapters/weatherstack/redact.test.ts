import { describe, expect, it } from 'vitest';
import { expectNoSecret, TEST_WEATHERSTACK_KEY } from '../../../test/helpers/secrets.ts';
import { redactText, redactUrl } from './redact.ts';

const KEY = TEST_WEATHERSTACK_KEY;
const BASE = 'https://weatherstack.test/current';

describe('redactUrl', () => {
  it.each([
    [
      'first',
      `${BASE}?access_key=${KEY}&query=x&units=f`,
      `${BASE}?access_key=[REDACTED]&query=x&units=f`,
    ],
    [
      'middle',
      `${BASE}?query=x&access_key=${KEY}&units=f`,
      `${BASE}?query=x&access_key=[REDACTED]&units=f`,
    ],
    [
      'last',
      `${BASE}?query=x&units=f&access_key=${KEY}`,
      `${BASE}?query=x&units=f&access_key=[REDACTED]`,
    ],
    [
      'URL-encoded',
      `${BASE}?access_key=${KEY}%2B%2F%3D&query=x`,
      `${BASE}?access_key=[REDACTED]&query=x`,
    ],
    ['before a fragment', `${BASE}?access_key=${KEY}#top`, `${BASE}?access_key=[REDACTED]#top`],
    ['empty', `${BASE}?access_key=&query=x`, `${BASE}?access_key=[REDACTED]&query=x`],
  ])('TR-01: redacts access_key when it is %s', (_where, url, expected) => {
    expect(redactUrl(url)).toBe(expected);
    expectNoSecret(redactUrl(url));
  });

  it('TR-01: accepts a URL object', () => {
    const url = new URL(BASE);
    url.searchParams.set('access_key', KEY);
    url.searchParams.set('query', '1 Main St, Boston, MA 02108, United States');

    const redacted = redactUrl(url);

    expect(redacted).toContain('access_key=[REDACTED]');
    expect(redacted).toContain('query=1+Main+St');
    expectNoSecret(redacted);
  });

  it('leaves a URL without access_key unchanged', () => {
    expect(redactUrl(`${BASE}?query=x&my_access_key_hint=1`)).toBe(
      `${BASE}?query=x&my_access_key_hint=1`,
    );
  });
});

describe('redactText', () => {
  it('TR-01: replaces every occurrence of the key', () => {
    const text = `fetch failed for ?access_key=${KEY} (${KEY})`;

    expect(redactText(text, KEY)).toBe('fetch failed for ?access_key=[REDACTED] ([REDACTED])');
  });

  it('TR-01: replaces the URL-encoded form of the key', () => {
    const key = 'a+b/c=';

    expect(redactText(`k=${encodeURIComponent(key)} raw=${key}`, key)).toBe(
      'k=[REDACTED] raw=[REDACTED]',
    );
  });

  it('leaves the text unchanged for an empty key', () => {
    expect(redactText('no secret here', '')).toBe('no secret here');
  });
});
