// Created once: building an Intl formatter is slow. Uses the viewer's time zone.
const dateTimeFormat = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}
