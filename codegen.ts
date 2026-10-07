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
      },
    },
  },
  hooks: { afterAllFileWrite: ['prettier --write'] },
};

export default config;
