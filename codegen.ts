import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: 'apps/api/schema.graphql',
  // The API runs on Node type stripping, so generated relative imports end in `.ts`.
  importExtension: '.ts',
  generates: {
    'apps/api/src/graphql/generated/resolvers-types.ts': {
      plugins: ['typescript', 'typescript-resolvers'],
      config: {
        enumsAsTypes: true,
        useTypeImports: true,
        contextType: '../context.ts#GraphQLContext',
        scalars: { JSON: 'unknown', DateTime: { input: 'Date', output: 'Date | string' } },
      },
    },
    'apps/web/src/graphql/': {
      preset: 'client',
      documents: ['apps/web/src/**/*.{ts,tsx}', '!apps/web/src/graphql/**'],
      config: {
        documentMode: 'string',
        // Without this the client preset types both scalars as `any`.
        scalars: { JSON: 'unknown', DateTime: 'string' },
        enumsAsTypes: true,
        useTypeImports: true,
      },
    },
  },
};

export default config;
