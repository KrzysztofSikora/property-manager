import { pino } from 'pino';
import type { DestinationStream, Logger } from 'pino';
import type { LogLevel } from './config/env.ts';

export function createLogger(level: LogLevel, destination?: DestinationStream): Logger {
  return destination === undefined ? pino({ level }) : pino({ level }, destination);
}
