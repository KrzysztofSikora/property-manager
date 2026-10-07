import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // One graphql instance: Vitest resolves our bare `graphql` import with CJS conditions, while
    // Yoga, loaded natively, gets the ESM build. Two `GraphQLError` classes break `instanceof`
    // in the error masking. Point our import at the file Node itself resolves.
    alias: [{ find: /^graphql$/, replacement: fileURLToPath(import.meta.resolve('graphql')) }],
  },
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
