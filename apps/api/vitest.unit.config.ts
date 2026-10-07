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
    name: 'api-unit',
    root: import.meta.dirname,
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: ['**/*.int.test.ts'],
    setupFiles: ['test/setup/msw.ts'],
  },
});
