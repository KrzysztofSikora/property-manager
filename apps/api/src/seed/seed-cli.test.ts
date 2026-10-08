import { http, HttpResponse } from 'msw/http';
import { describe, expect, it } from 'vitest';
import { server } from '../../test/setup/msw.ts';
import { runSeedCli } from './seed-cli.ts';

describe('runSeedCli', () => {
  it('returns 1 with the config message and sends nothing when SEED_API_URL is invalid', async () => {
    const requests: string[] = [];
    server.use(
      http.all('*', ({ request }) => {
        requests.push(request.url);
        return HttpResponse.error();
      }),
    );
    const stdout: string[] = [];
    const stderr: string[] = [];

    const code = await runSeedCli(
      { SEED_API_URL: 'not-a-url' },
      { stdout: (line) => stdout.push(line), stderr: (line) => stderr.push(line) },
    );

    expect(code).toBe(1);
    expect(stderr).toEqual(['Invalid environment variable: SEED_API_URL (expected a URL)']);
    expect(stdout).toEqual([]);
    expect(requests).toEqual([]);
  });
});
