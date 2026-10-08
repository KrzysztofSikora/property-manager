import { ConfigError, loadSeedConfig } from '../config/env.ts';
import { SEED_ADDRESSES } from './addresses.ts';
import { runSeed } from './seed.ts';

export type SeedIo = { stdout: (line: string) => void; stderr: (line: string) => void };

// `pnpm seed`: run by hand only, never by Compose, CI, hooks or scripts (FR-16).
export async function runSeedCli(
  env: Record<string, string | undefined>,
  io: SeedIo,
): Promise<0 | 1> {
  let apiUrl: string;
  try {
    ({ apiUrl } = loadSeedConfig(env));
  } catch (error) {
    if (error instanceof ConfigError) {
      io.stderr(error.message);
      return 1;
    }
    throw error;
  }

  return runSeed({
    apiUrl,
    addresses: SEED_ADDRESSES,
    fetch: (url, init) => fetch(url, init),
    sleep: (ms) =>
      new Promise((resolve) => {
        setTimeout(resolve, ms);
      }),
    ...io,
  });
}

if (import.meta.main) {
  process.exitCode = await runSeedCli(process.env, {
    stdout: (line) => {
      console.log(line);
    },
    stderr: (line) => {
      console.error(line);
    },
  });
}
