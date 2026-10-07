import { describe, expect, it } from 'vitest';
import { captureLogs } from './logs.ts';

describe('captureLogs', () => {
  it('returns each written line parsed, with its fields', () => {
    const { logger, lines } = captureLogs();

    logger.child({ requestId: 'r-1' }).info({ outcome: 'executed' }, 'graphql operation');
    logger.debug('details');

    expect(lines()).toEqual([
      expect.objectContaining({
        level: 30,
        requestId: 'r-1',
        outcome: 'executed',
        msg: 'graphql operation',
      }),
      expect.objectContaining({ level: 20, msg: 'details' }),
    ]);
  });

  it('keeps loggers apart and hands out a copy of the lines', () => {
    const first = captureLogs();
    const second = captureLogs();

    first.logger.info('one');
    first.lines().length = 0;

    expect(first.lines()).toHaveLength(1);
    expect(second.lines()).toEqual([]);
  });
});
