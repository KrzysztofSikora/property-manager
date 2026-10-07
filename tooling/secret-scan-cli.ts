// Pre-commit secret scan: fails when the staged diff adds the Weatherstack key or a key-like
// `access_key=` value. Prints only `file:line kind`, never the matched text.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findSecretLeaks, formatLeaks } from './secret-scan.ts';

const root = join(import.meta.dirname, '..');

function readKeyFromEnvFile(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const match = /^\s*(?:export\s+)?WEATHERSTACK_KEY\s*=\s*(.*)$/.exec(raw);
    if (match?.[1] !== undefined) {
      const value = match[1].trim().replace(/^(['"])(.*)\1$/, '$2');
      return value === '' ? undefined : value;
    }
  }
  return undefined;
}

const diff = execFileSync('git', ['diff', '--cached', '-U0', '--no-color', '--no-ext-diff'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
const leaks = findSecretLeaks(diff, readKeyFromEnvFile(join(root, '.env')));

if (leaks.length > 0) {
  process.stderr.write(
    `Secret scan: possible Weatherstack key in staged changes:\n${formatLeaks(leaks)}\n`,
  );
  process.exit(1);
}
