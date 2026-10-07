import type { Resolvers } from './generated/resolvers-types.ts';

export const resolvers: Resolvers = {
  Query: {
    health: () => 'ok',
  },
};
