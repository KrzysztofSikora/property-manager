import { expect } from 'vitest';

// Tests load config with this instead of a real key. Leak checks search for it.
export const TEST_WEATHERSTACK_KEY = 'TEST_WEATHERSTACK_KEY';

// JSON.stringify drops an Error's own fields, which is where a leaked URL would sit.
// Every own property counts: message, stack, cause, AggregateError's errors, custom fields.
function revealErrors(_key: string, value: unknown): unknown {
  if (!(value instanceof Error)) return value;
  const fields = Object.getOwnPropertyNames(value).map((key): [string, unknown] => [
    key,
    Reflect.get(value, key),
  ]);
  return { name: value.name, ...Object.fromEntries(fields) };
}

function serialize(value: unknown): string {
  if (typeof value === 'string') return value;
  // These have no JSON form (stringify returns undefined) and hold no text to leak.
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return '';
  return JSON.stringify(value, revealErrors);
}

// Pass a GraphQL result, log lines, an error: anything a caller or an operator could see.
// The failure message names only the argument, never the text around the match.
export function expectNoSecret(...values: unknown[]): void {
  values.forEach((value, index) => {
    if (serialize(value).includes(TEST_WEATHERSTACK_KEY)) {
      expect.fail(`expectNoSecret: argument ${String(index)} contains the Weatherstack key`);
    }
  });
}
