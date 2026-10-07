import { ConfigError, loadDatabaseConfig } from '../config/env.ts';
import { runMigrations } from './migrate.ts';

function decodedOrSelf(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// The URL may hold a password, so neither it nor the password reaches the output.
function redact(message: string, databaseUrl: string): string {
  const secrets = [databaseUrl];
  const password = URL.parse(databaseUrl)?.password ?? '';
  if (password !== '') secrets.push(password, decodedOrSelf(password));
  return secrets.reduce((text, secret) => text.replaceAll(secret, '[REDACTED]'), message);
}

function messageOf(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  // A refused connection to several addresses is an AggregateError with an empty message.
  return error.message === '' ? error.name : error.message;
}

export async function runMigrateCli(
  env: Record<string, string | undefined>,
  stderr: (line: string) => void,
): Promise<0 | 1> {
  let databaseUrl: string;
  try {
    ({ databaseUrl } = loadDatabaseConfig(env));
  } catch (error) {
    if (error instanceof ConfigError) {
      stderr(error.message);
      return 1;
    }
    throw error;
  }

  try {
    await runMigrations(databaseUrl);
    return 0;
  } catch (error) {
    stderr(`Migration failed: ${redact(messageOf(error), databaseUrl)}`);
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = await runMigrateCli(process.env, (line) => {
    console.error(line);
  });
}
