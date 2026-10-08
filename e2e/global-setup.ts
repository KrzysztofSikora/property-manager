import { compose } from './compose.ts';

// `--wait` returns once every service's healthcheck passes (api after its migrations).
// On failure the logs are printed here: global teardown still runs and `down -v` removes the
// containers, so CI would otherwise lose the cause.
export default function globalSetup(): void {
  try {
    compose('up', '-d', '--build', '--wait');
  } catch (error) {
    try {
      compose('logs', '--no-color');
    } catch {
      // Keep the start-up error, not a logs failure.
    }
    throw error;
  }
}
