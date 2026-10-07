import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'api-int',
    root: import.meta.dirname,
    include: ['test/integration/**/*.int.test.ts'],
    globalSetup: ['test/setup/postgres.ts'],
    setupFiles: ['test/setup/msw.ts'],
    // One shared database: integration files must not run concurrently.
    fileParallelism: false,
    // The first run pulls the postgres image.
    hookTimeout: 120_000,
  },
});
