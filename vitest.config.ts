import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/shared/vitest.config.ts',
      {
        test: {
          name: 'tooling',
          root: import.meta.dirname,
          include: ['tooling/**/*.test.ts'],
          exclude: ['tooling/fixtures/**'],
        },
      },
    ],
  },
});
