import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import type { Linter } from 'eslint';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

// Node type stripping runs `.ts` files as they are, so a `./x.js` specifier fails at runtime.
const JS_RELATIVE_IMPORT = {
  regex: '^\\.{1,2}/.*\\.js$',
  message: 'Relative imports end in .ts (Node type stripping).',
};

// Flat config replaces rule options per file instead of merging them, so every layer entry
// repeats the `.js` pattern.
function restrictImports(...group: string[]): Linter.RulesRecord {
  const patterns: object[] = [JS_RELATIVE_IMPORT];
  if (group.length > 0) {
    patterns.push({ group, message: 'Layers: resolver → service → repository / adapter.' });
  }
  return { 'no-restricted-imports': ['error', { patterns }] };
}

export default defineConfig(
  {
    ignores: [
      '**/generated/**',
      'apps/web/src/graphql/**',
      'tooling/fixtures/**',
      'reports/**',
      '**/.stryker-tmp/**',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: restrictImports(),
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest']],
  },
  {
    files: ['apps/api/src/graphql/**/*.ts'],
    rules: restrictImports('**/repositories/**', '**/adapters/**', 'drizzle-orm*', 'pg'),
  },
  {
    files: ['apps/api/src/services/**/*.ts'],
    rules: restrictImports('**/graphql/**', 'graphql-yoga', 'graphql', 'drizzle-orm*', 'pg'),
  },
  {
    files: ['apps/api/src/repositories/**/*.ts', 'apps/api/src/adapters/**/*.ts'],
    rules: restrictImports('**/services/**', '**/graphql/**'),
  },
  prettier,
);
