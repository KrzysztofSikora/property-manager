import { describe, expect, it } from 'vitest';
import { formatDateTime } from './format';

describe('formatDateTime', () => {
  it('formats an ISO date-time as en-US medium date and short time in the viewer time zone', () => {
    // Web tests run with TZ=UTC. A non-midnight time near the day boundary would shift date and
    // hour under any other zone, so this also proves the pin holds.
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('UTC');
    expect(formatDateTime('2026-09-14T23:42:00.000Z')).toBe('Sep 14, 2026, 11:42 PM');
  });
});
