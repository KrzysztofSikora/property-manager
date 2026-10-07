import type { Logger } from 'pino';

export type GraphQLContext = {
  requestId: string;
  logger: Logger;
};
