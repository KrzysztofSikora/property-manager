import { compose } from './compose.ts';

// `-v` drops the e2e volume, so every run starts on an empty database.
// `E2E_KEEP_STACK=1` leaves the stack up for debugging (web on http://localhost:5180).
export default function globalTeardown(): void {
  if (process.env.E2E_KEEP_STACK === '1') return;
  compose('down', '-v');
}
