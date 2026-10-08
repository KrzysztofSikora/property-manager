import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');

// The layer folders are virtual here, so type-aware linting is off: none of the rules under
// test needs type information, and the project service rejects files outside any tsconfig.
const eslint = new ESLint({ cwd: root, overrideConfig: tseslint.configs.disableTypeChecked });

async function ruleIds(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: join(root, filePath) });
  return (result?.messages ?? []).map((m) => m.ruleId ?? 'fatal');
}

describe('NFR-06: layer and import rules', () => {
  it.each([
    ['resolver → repository', 'apps/api/src/graphql/resolvers.ts', '../repositories/x.ts'],
    ['resolver → adapter', 'apps/api/src/graphql/resolvers.ts', '../adapters/x.ts'],
    ['service → resolver', 'apps/api/src/services/x.ts', '../graphql/resolvers.ts'],
    ['service → graphql-yoga', 'apps/api/src/services/x.ts', 'graphql-yoga'],
    ['repository → service', 'apps/api/src/repositories/x.ts', '../services/x.ts'],
    ['resolver → db', 'apps/api/src/graphql/resolvers.ts', '../db/schema.ts'],
    ['service → db', 'apps/api/src/services/x.ts', '../db/schema.ts'],
    ['adapter → db', 'apps/api/src/adapters/x.ts', '../db/schema.ts'],
    ['adapter → service', 'apps/api/src/adapters/x.ts', '../services/x.ts'],
    ['relative .js import', 'apps/api/src/app.ts', './x.js'],
    ['relative .js import in a layer', 'apps/api/src/services/x.ts', './y.js'],
    ['seed → service', 'apps/api/src/seed/seed.ts', '../services/x.ts'],
    ['seed → repository', 'apps/api/src/seed/seed.ts', '../repositories/x.ts'],
    ['seed → db', 'apps/api/src/seed/seed.ts', '../db/client.ts'],
    ['seed → graphql-yoga', 'apps/api/src/seed/seed.ts', 'graphql-yoga'],
    ['main → seed', 'apps/api/src/main.ts', './seed/seed.ts'],
    ['app → seed', 'apps/api/src/app.ts', './seed/seed.ts'],
    ['service → seed', 'apps/api/src/services/x.ts', '../seed/seed.ts'],
    ['domain → seed addresses', 'apps/api/src/domain/x.ts', '../seed/addresses.ts'],
  ])('NFR-06 rejects %s', async (_name, filePath, specifier) => {
    const code = `import { a } from '${specifier}';\nexport const b = a;\n`;

    expect(await ruleIds(code, filePath)).toContain('no-restricted-imports');
  });

  it('NFR-06 control: a resolver may import a service', async () => {
    const code = "import { a } from '../services/x.ts';\nexport const b = a;\n";

    expect(await ruleIds(code, 'apps/api/src/graphql/resolvers.ts')).toEqual([]);
  });

  it('NFR-06 control: the seed may import the env config', async () => {
    const code = "import { a } from '../config/env.ts';\nexport const b = a;\n";

    expect(await ruleIds(code, 'apps/api/src/seed/seed-cli.ts')).toEqual([]);
  });

  it('NFR-06 control: the seed CLI may import the seed', async () => {
    const code = "import { a } from './seed.ts';\nexport const b = a;\n";

    expect(await ruleIds(code, 'apps/api/src/seed/seed-cli.ts')).toEqual([]);
  });

  it('NFR-06 control: a repository may import the db schema', async () => {
    const code = "import { a } from '../db/schema.ts';\nexport const b = a;\n";

    expect(await ruleIds(code, 'apps/api/src/repositories/x.ts')).toEqual([]);
  });
});

describe('NFR-04: strict TypeScript', () => {
  it('NFR-04 ESLint rejects explicit any', async () => {
    const code = 'export const f = (x: any): unknown => x;\n';

    expect(await ruleIds(code, 'apps/api/src/app.ts')).toContain(
      '@typescript-eslint/no-explicit-any',
    );
  });

  it('NFR-04 tsc rejects enums, parameter properties and value imports of types', async () => {
    const tsc = join(root, 'node_modules/typescript/bin/tsc');
    const project = join(root, 'tooling/fixtures/tsconfig.json');
    const output = await promisify(execFile)(process.execPath, [
      tsc,
      '-p',
      project,
      '--pretty',
      'false',
    ]).then(
      () => '',
      (error: unknown) => (error instanceof Error && 'stdout' in error ? String(error.stdout) : ''),
    );

    expect(output).toMatch(/enum\.ts\(\d+,\d+\): error TS1294/);
    expect(output).toMatch(/param-props\.ts\(\d+,\d+\): error TS1294/);
    expect(output).toMatch(/type-import\.ts\(\d+,\d+\): error TS1484/);
  });
});

// The whole word, so `seeded` or `seedProperty` do not trip it, while `pnpm seed`,
// `pnpm --filter … seed` and `npm run seed` do. A false hit fails loudly: reword the file.
const SEED_WORD = /\bseed\b/i;

const AUTOMATIC_FILES = [
  'docker-compose.yml',
  'docker-compose.e2e.yml',
  'apps/api/Dockerfile',
  'apps/web/Dockerfile',
  '.github/workflows/ci.yml',
  '.githooks/pre-commit',
  '.claude/settings.json',
];

const PACKAGE_FILES = [
  'package.json',
  'apps/api/package.json',
  'apps/web/package.json',
  'packages/shared/package.json',
];

const read = (path: string): Promise<string> => readFile(join(root, path), 'utf8');

// The Claude Code hooks and every `tooling/` script they run, transitively.
async function hookScripts(): Promise<string[]> {
  const found = new Set<string>();
  const queue = ['.claude/settings.json'];
  for (let path = queue.shift(); path !== undefined; path = queue.shift()) {
    for (const [ref] of (await read(path)).matchAll(/tooling\/[\w.-]+\.(?:sh|ts)\b/g)) {
      if (!found.has(ref)) {
        found.add(ref);
        queue.push(ref);
      }
    }
  }
  return [...found];
}

async function e2eFiles(): Promise<string[]> {
  const names = await readdir(join(root, 'e2e'));
  return names.filter((name) => name.endsWith('.ts')).map((name) => `e2e/${name}`);
}

function scriptsOf(json: string): Record<string, string> {
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== 'object' || parsed === null || !('scripts' in parsed)) return {};
  const { scripts } = parsed;
  if (typeof scripts !== 'object' || scripts === null) return {};
  return Object.fromEntries(Object.entries(scripts).map(([name, value]) => [name, String(value)]));
}

describe('FR-16: the seed never runs automatically', () => {
  it('FR-16 control: the check flags `pnpm seed` and ignores `seeded`', () => {
    expect(SEED_WORD.test('command: sh -c "pnpm db:migrate && pnpm seed"')).toBe(true);
    expect(SEED_WORD.test('run: pnpm --filter @property-manager/api Seed')).toBe(true);
    expect(SEED_WORD.test('# the stub is seeded with seedProperty()')).toBe(false);
  });

  it('FR-16 the hook scan reaches the format hook script', async () => {
    expect(await hookScripts()).toEqual([
      'tooling/claude-format-hook.sh',
      'tooling/claude-format-hook.ts',
    ]);
  });

  it('FR-16 no Compose, Docker, CI, git hook, e2e or Claude hook file mentions the word seed', async () => {
    const files = [...AUTOMATIC_FILES, ...(await e2eFiles()), ...(await hookScripts())];
    const hits: string[] = [];
    for (const file of files) {
      if (SEED_WORD.test(await read(file))) hits.push(file);
    }

    expect(files.length).toBeGreaterThan(AUTOMATIC_FILES.length);
    expect(hits).toEqual([]);
  });

  it('FR-16 no package script other than `seed` mentions the word seed', async () => {
    const hits: string[] = [];
    for (const file of PACKAGE_FILES) {
      for (const [name, command] of Object.entries(scriptsOf(await read(file)))) {
        if (name !== 'seed' && SEED_WORD.test(`${name} ${command}`)) hits.push(`${file}: ${name}`);
      }
    }

    expect(hits).toEqual([]);
  });

  it('FR-16 control: `pnpm seed` exists as a script', async () => {
    expect(scriptsOf(await read('package.json')).seed).toBe(
      'pnpm --filter @property-manager/api seed',
    );
    expect(scriptsOf(await read('apps/api/package.json')).seed).toBe(
      'node --env-file-if-exists=../../.env src/seed/seed-cli.ts',
    );
  });
});
