import type { Logger } from 'pino';
import type { PropertyService } from '../services/property.service.ts';

export type GraphQLContext = {
  requestId: string;
  logger: Logger;
  services: { property: PropertyService };
};
