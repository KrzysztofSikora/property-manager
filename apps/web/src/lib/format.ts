// Created once: building an Intl formatter is slow. Uses the viewer's time zone.
const dateTimeFormat = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

// US EPA air-quality index bands. Index 1 is at position 0.
const EPA_INDEX_LABELS = [
  'Good',
  'Moderate',
  'Unhealthy for Sensitive Groups',
  'Unhealthy',
  'Very Unhealthy',
  'Hazardous',
];

// "1 (Good)" for 1-6; any other value is shown as the bare number.
export function epaIndexLabel(index: number): string {
  const label = EPA_INDEX_LABELS[index - 1];
  return label === undefined ? String(index) : `${String(index)} (${label})`;
}

export type EpaIndexTone = 'good' | 'fair' | 'poor' | 'neutral';

// Badge colour for a US EPA index: 1 good, 2-3 fair, 4-6 poor, any other value neutral.
export function epaIndexTone(index: number): EpaIndexTone {
  if (index === 1) return 'good';
  if (index === 2 || index === 3) return 'fair';
  if (index >= 4 && index <= 6) return 'poor';
  return 'neutral';
}
