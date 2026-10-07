import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Json = string | number | boolean | null | Json[] | JsonObject;

export type JsonObject = { [key: string]: Json };

// `undefined` removes the key, so the "missing field" cases can be built.
export type JsonOverrides = { [key: string]: Json | JsonOverrides | undefined };

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// A narrower input type than `isPlainObject`: the false branch keeps only scalars and arrays.
function isOverrideObject(value: Json | JsonOverrides): value is JsonOverrides {
  return isPlainObject(value);
}

// Walk up to the workspace root instead of a fixed `../../..`: Stryker runs the tests from a
// sandbox copy of `apps/api`, one level deeper, without `docs/`.
function workspaceRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(dir, 'pnpm-workspace.yaml'))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error('weatherstack fixture: pnpm-workspace.yaml not found');
    dir = parent;
  }
  return dir;
}

export const WEATHERSTACK_SAMPLE_PATH = join(
  workspaceRoot(),
  'docs/samples/weatherstack-current.json',
);

function loadSample(): JsonObject {
  const parsed: unknown = JSON.parse(readFileSync(WEATHERSTACK_SAMPLE_PATH, 'utf8'));
  if (!isPlainObject(parsed)) throw new Error('weatherstack fixture: sample is not an object');
  return parsed;
}

function merge(base: JsonObject, overrides: JsonOverrides): JsonObject {
  const result: JsonObject = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- removing a key is the point
      delete result[key];
      continue;
    }
    if (isOverrideObject(value)) {
      // Merging into `{}` also strips `undefined` from an override that replaces a scalar.
      const current = result[key];
      result[key] = merge(isPlainObject(current) ? current : {}, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// The recorded `units=f` response from `docs/samples/weatherstack-current.json`, with overrides
// deep-merged into a fresh copy. Objects merge; arrays and scalars replace.
export function weatherstackResponse(overrides: JsonOverrides = {}): JsonObject {
  return merge(loadSample(), overrides);
}

export function weatherstackError(code: number, type: string, info?: string): JsonObject {
  return {
    success: false,
    error: { code, type, info: info ?? `Fixture error ${String(code)} (${type}).` },
  };
}
