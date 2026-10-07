import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'tooling',
    root: import.meta.dirname,
    include: ['**/*.test.ts'],
    exclude: ['fixtures/**', '**/node_modules/**'],
  },
});
