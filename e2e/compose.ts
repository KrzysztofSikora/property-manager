import { spawnSync } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

// Own project name, so the e2e containers and volume never touch the dev stack.
const BASE_ARGS = [
  'compose',
  '-p',
  'property-manager-e2e',
  '-f',
  path.join(REPO_ROOT, 'docker-compose.yml'),
  '-f',
  path.join(REPO_ROOT, 'docker-compose.e2e.yml'),
];

// Runs `docker compose …` on the e2e stack from the repo root, whatever the caller's cwd.
export function compose(...args: string[]): void {
  const result = spawnSync('docker', [...BASE_ARGS, ...args], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`docker compose ${args.join(' ')} exited with ${String(result.status)}`);
  }
}
