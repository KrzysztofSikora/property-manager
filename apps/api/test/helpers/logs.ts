import type { Logger } from 'pino';
import { createLogger } from '../../src/logger.ts';

export type LogLine = Record<string, unknown>;

export type CapturedLogs = { logger: Logger; lines: () => LogLine[] };

function isLogLine(value: unknown): value is LogLine {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// A pino logger over an in-memory stream. Level `trace`, so leak checks see every line.
export function captureLogs(): CapturedLogs {
  const lines: LogLine[] = [];
  const logger = createLogger('trace', {
    write(line: string) {
      const parsed: unknown = JSON.parse(line);
      if (!isLogLine(parsed)) throw new Error('captureLogs: pino wrote a non-object line');
      lines.push(parsed);
    },
  });
  return { logger, lines: () => [...lines] };
}
