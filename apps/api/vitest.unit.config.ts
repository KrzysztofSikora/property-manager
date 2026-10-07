import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'api-unit',
    root: import.meta.dirname,
    include: ['src/**/*.test.ts'],
    exclude: ['**/*.int.test.ts'],
    setupFiles: ['test/setup/msw.ts'],
  },
});
