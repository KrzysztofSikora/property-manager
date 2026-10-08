import { execFile } from 'node:child_process';
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
  ])('NFR-06 rejects %s', async (_name, filePath, specifier) => {
    const code = `import { a } from '${specifier}';\nexport const b = a;\n`;

    expect(await ruleIds(code, filePath)).toContain('no-restricted-imports');
  });

  it('NFR-06 control: a resolver may import a service', async () => {
    const code = "import { a } from '../services/x.ts';\nexport const b = a;\n";

    expect(await ruleIds(code, 'apps/api/src/graphql/resolvers.ts')).toEqual([]);
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
