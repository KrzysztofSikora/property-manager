import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { getOperationAST, Kind } from 'graphql';
import type { DocumentNode } from 'graphql';
import { createSchema, createYoga } from 'graphql-yoga';
import type { Plugin, YogaServerInstance } from 'graphql-yoga';
import type { Logger } from 'pino';
import type { Config } from './config/env.ts';
import type { GraphQLContext } from './graphql/context.ts';
import { resolvers } from './graphql/resolvers.ts';

const typeDefs = readFileSync(new URL('../schema.graphql', import.meta.url), 'utf8');

export type AppDeps = {
  config: Config;
  logger: Logger;
};

export type App = {
  yoga: YogaServerInstance<object, GraphQLContext>;
};

// Envelop types the execute args as `any`, so they are narrowed before use.
function isDocumentNode(value: unknown): value is DocumentNode {
  return (
    typeof value === 'object' && value !== null && 'kind' in value && value.kind === Kind.DOCUMENT
  );
}

function operationNameOf(document: unknown, requested: unknown): string | null {
  if (!isDocumentNode(document)) return null;
  const operation = getOperationAST(document, typeof requested === 'string' ? requested : null);
  return operation?.name?.value ?? null;
}

// One line per operation. Variables are never logged: create inputs are user data.
function operationLogging(): Plugin<GraphQLContext> {
  return {
    onExecute({ args }) {
      const start = performance.now();
      return {
        onExecuteDone() {
          args.contextValue.logger.info(
            {
              operationName: operationNameOf(args.document, args.operationName),
              durationMs: Math.round(performance.now() - start),
            },
            'graphql operation',
          );
        },
      };
    },
  };
}

// Composition root: S-01 wires services, repositories and adapters here.
export function createApp({ logger }: AppDeps): App {
  const yoga = createYoga<object, GraphQLContext>({
    schema: createSchema<GraphQLContext>({ typeDefs, resolvers }),
    context: () => {
      const requestId = randomUUID();
      return { requestId, logger: logger.child({ requestId }) };
    },
    plugins: [operationLogging()],
    logging: false,
  });
  return { yoga };
}
