import { defineConfig } from 'drizzle-kit';

// `generate` reads only the schema and the journal, so no database URL is needed.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
