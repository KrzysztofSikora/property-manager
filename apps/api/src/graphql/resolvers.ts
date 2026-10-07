import { addressSchema } from '@property-manager/shared';
import { DateTimeResolver, JSONResolver } from 'graphql-scalars';
import { z } from 'zod';
import { badUserInput } from './errors.ts';
import type { Resolvers } from './generated/resolvers-types.ts';

const propertyId = z.uuid();

// Resolvers validate and map; the service holds the flow. Domain objects match the SDL shape,
// so they are returned as they are.
export const resolvers: Resolvers = {
  JSON: JSONResolver,
  DateTime: DateTimeResolver,
  Query: {
    health: () => 'ok',
    // A malformed id cannot match a row: null without a query.
    property: (_parent, { id }, { services }) => {
      const parsed = propertyId.safeParse(id);
      return parsed.success ? services.property.getById(parsed.data) : null;
    },
  },
  Mutation: {
    // Validated and normalized before any weather call (FR-07).
    createProperty: (_parent, args, { services }) => {
      const parsed = addressSchema.safeParse(args);
      if (!parsed.success) throw badUserInput(parsed.error.issues);
      return services.property.create(parsed.data);
    },
  },
};
