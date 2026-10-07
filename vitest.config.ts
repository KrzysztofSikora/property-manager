import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/shared/vitest.config.ts',
      'apps/api/vitest.unit.config.ts',
      'apps/api/vitest.int.config.ts',
      'apps/web/vitest.config.ts',
      'tooling/vitest.config.ts',
    ],
  },
});
