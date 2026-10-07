export const REDACTED = '[REDACTED]';

// The key is a query parameter, so any logged URL would carry it.
const ACCESS_KEY_VALUE = /([?&]access_key=)[^&#]*/g;

export function redactUrl(url: string | URL): string {
  const text = typeof url === 'string' ? url : url.href;
  return text.replace(ACCESS_KEY_VALUE, `$1${REDACTED}`);
}

// For error messages and causes, which may quote the URL in either encoding.
export function redactText(text: string, key: string): string {
  if (key === '') return text;
  return [key, encodeURIComponent(key)].reduce(
    (result, form) => result.replaceAll(form, REDACTED),
    text,
  );
}
