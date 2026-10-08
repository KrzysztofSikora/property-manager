import { compose } from './compose.ts';

// `--wait` returns once every service's healthcheck passes (api after its migrations).
export default function globalSetup(): void {
  compose('up', '-d', '--build', '--wait');
}
