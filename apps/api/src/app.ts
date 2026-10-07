import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { getOperationAST, Kind } from 'graphql';
import type { DocumentNode } from 'graphql';
import { createSchema, createYoga } from 'graphql-yoga';
import type { Plugin, YogaServerInstance } from 'graphql-yoga';
import type { Logger } from 'pino';
import type { Config } from './config/env.ts';
import type { PropertyRepository, WeatherClient } from './domain/ports.ts';
import type { GraphQLContext } from './graphql/context.ts';
import { createMaskError } from './graphql/errors.ts';
import { resolvers } from './graphql/resolvers.ts';
import { createPropertyService } from './services/property.service.ts';

const typeDefs = readFileSync(new URL('../schema.graphql', import.meta.url), 'utf8');

// Ports, not concrete adapters: `main.ts` passes the Drizzle repository and the Weatherstack
// client, tests pass fakes.
export type AppDeps = {
  config: Config;
  logger: Logger;
  repository: PropertyRepository;
  weather: WeatherClient;
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

type Outcome = 'executed' | 'parse_error' | 'validation_error';

// One line per request. Variables are never logged: create inputs are user data.
// Yoga builds the context (requestId, child logger) only after a document parses and
// validates, so a rejected request is logged through the root logger with a fresh requestId.
function operationLogging(logger: Logger): Plugin<GraphQLContext> {
  const logRejected = (outcome: Outcome) => {
    logger
      .child({ requestId: randomUUID() })
      .info({ operationName: null, outcome }, 'graphql operation');
  };
  return {
    onParse() {
      return ({ result }) => {
        if (result instanceof Error) logRejected('parse_error');
      };
    },
    onValidate() {
      return ({ valid }) => {
        if (!valid) logRejected('validation_error');
      };
    },
    onExecute({ args }) {
      const start = performance.now();
      return {
        onExecuteDone() {
          args.contextValue.logger.info(
            {
              operationName: operationNameOf(args.document, args.operationName),
              outcome: 'executed' satisfies Outcome,
              durationMs: Math.round(performance.now() - start),
            },
            'graphql operation',
          );
        },
      };
    },
  };
}

// Composition root: services are built here from the ports.
export function createApp({ logger, repository, weather }: AppDeps): App {
  const services = { property: createPropertyService({ repository, weather }) };
  const yoga = createYoga<object, GraphQLContext>({
    schema: createSchema<GraphQLContext>({ typeDefs, resolvers }),
    context: () => {
      const requestId = randomUUID();
      return { requestId, logger: logger.child({ requestId }), services };
    },
    plugins: [operationLogging(logger)],
    maskedErrors: { maskError: createMaskError(logger) },
    logging: false,
  });
  return { yoga };
}
