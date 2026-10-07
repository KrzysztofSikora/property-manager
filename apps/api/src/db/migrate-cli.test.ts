import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runMigrateCli } from './migrate-cli.ts';
import { runMigrations } from './migrate.ts';

vi.mock('./migrate.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./migrate.ts')>();
  return { runMigrations: vi.fn(actual.runMigrations) };
});

const SENTINEL = 'SENTINEL_DB_PASSWORD';

async function run(
  env: Record<string, string | undefined>,
): Promise<{ code: number; stderr: string[] }> {
  const stderr: string[] = [];
  const code = await runMigrateCli(env, (line) => stderr.push(line));
  return { code, stderr };
}

describe('runMigrateCli', () => {
  beforeEach(() => {
    vi.mocked(runMigrations).mockClear();
  });

  it('returns 1 without printing the password when the database is unreachable', async () => {
    const { code, stderr } = await run({ DATABASE_URL: `postgres://u:${SENTINEL}@127.0.0.1:1/x` });

    expect(code).toBe(1);
    expect(stderr).toHaveLength(1);
    expect(stderr[0]).toMatch(/^Migration failed: /);
    expect(stderr.join('\n')).not.toContain(SENTINEL);
  });

  it.each([
    {
      case: 'the URL and its password',
      url: `postgres://u:${SENTINEL}@db.example:5432/x`,
      message: `cannot reach postgres://u:${SENTINEL}@db.example:5432/x; auth failed for password ${SENTINEL}`,
      expected: 'cannot reach [REDACTED]; auth failed for password [REDACTED]',
    },
    {
      case: 'the decoded form of a percent-encoded password',
      url: `postgres://u:${SENTINEL}%2F1@db.example/x`,
      message: `bad password ${SENTINEL}/1`,
      expected: 'bad password [REDACTED]',
    },
    {
      case: 'the raw password when its percent-encoding is malformed',
      url: `postgres://u:${SENTINEL}%ZZ@db.example/x`,
      message: `bad password ${SENTINEL}%ZZ`,
      expected: 'bad password [REDACTED]',
    },
    {
      case: 'nothing else when the URL has no password',
      url: 'postgres://u@db.example/x',
      message: 'role "u" does not exist',
      expected: 'role "u" does not exist',
    },
  ])('redacts $case', async ({ url, message, expected }) => {
    vi.mocked(runMigrations).mockRejectedValueOnce(new Error(message));

    const { code, stderr } = await run({ DATABASE_URL: url });

    expect(code).toBe(1);
    expect(stderr).toEqual([`Migration failed: ${expected}`]);
  });

  it.each([
    { case: 'a non-Error rejection', error: 'socket closed', expected: 'socket closed' },
    {
      // A refused connection to several addresses (localhost -> ::1 and 127.0.0.1).
      case: 'an AggregateError with an empty message',
      error: new AggregateError([new Error('ECONNREFUSED')], ''),
      expected: 'AggregateError',
    },
  ])('reports $case with a non-empty reason', async ({ error, expected }) => {
    vi.mocked(runMigrations).mockRejectedValueOnce(error);

    const { stderr } = await run({ DATABASE_URL: 'postgres://u:p@db.example/x' });

    expect(stderr).toEqual([`Migration failed: ${expected}`]);
  });

  it('returns 1 naming DATABASE_URL and never migrates when the URL is invalid', async () => {
    const { code, stderr } = await run({ DATABASE_URL: 'not-a-url' });

    expect(code).toBe(1);
    expect(stderr).toEqual(['Invalid environment variable: DATABASE_URL (expected a URL)']);
    expect(runMigrations).not.toHaveBeenCalled();
  });

  it('returns 0 and prints nothing when the migrations apply', async () => {
    vi.mocked(runMigrations).mockResolvedValueOnce(undefined);

    const { code, stderr } = await run({ DATABASE_URL: 'postgres://u:p@db.example:5432/x' });

    expect(code).toBe(0);
    expect(stderr).toEqual([]);
    expect(runMigrations).toHaveBeenCalledWith('postgres://u:p@db.example:5432/x');
  });
});
