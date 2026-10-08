import { describe, expect, it } from 'vitest';
import { epaIndexLabel, epaIndexTone, formatDateTime } from './format';

describe('formatDateTime', () => {
  it('formats an ISO date-time as en-US medium date and short time in the viewer time zone', () => {
    // Web tests run with TZ=UTC. A non-midnight time near the day boundary would shift date and
    // hour under any other zone, so this also proves the pin holds.
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('UTC');
    expect(formatDateTime('2026-09-14T23:42:00.000Z')).toBe('Sep 14, 2026, 11:42 PM');
  });
});

describe('epaIndexLabel', () => {
  it.each([
    [1, '1 (Good)'],
    [2, '2 (Moderate)'],
    [3, '3 (Unhealthy for Sensitive Groups)'],
    [4, '4 (Unhealthy)'],
    [5, '5 (Very Unhealthy)'],
    [6, '6 (Hazardous)'],
  ])('TR-28: labels US EPA index %i as %s', (index, label) => {
    expect(epaIndexLabel(index)).toBe(label);
  });

  it.each([
    [0, '0'],
    [7, '7'],
  ])('TR-28: shows index %i outside 1-6 as the bare number', (index, label) => {
    expect(epaIndexLabel(index)).toBe(label);
  });
});

describe('epaIndexTone', () => {
  it.each([
    [0, 'neutral'],
    [1, 'good'],
    [2, 'fair'],
    [3, 'fair'],
    [4, 'poor'],
    [6, 'poor'],
    [7, 'neutral'],
  ] as const)('TR-28: gives US EPA index %i the %s badge tone', (index, tone) => {
    expect(epaIndexTone(index)).toBe(tone);
  });
});
