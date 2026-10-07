import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';

type Exit = { code: number | null; stderr: string };

function runMain(env: NodeJS.ProcessEnv): Promise<Exit> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['src/main.ts'], {
      cwd: new URL('..', import.meta.url),
      env,
      stdio: ['ignore', 'ignore', 'pipe'],
      timeout: 10_000,
    });
    let stderr = '';
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stderr });
    });
  });
}

// CI sets a sentinel key for the whole test step, so each case builds its own env.
function envWithKey(value: string | undefined): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.WEATHERSTACK_KEY;
  if (value !== undefined) env.WEATHERSTACK_KEY = value;
  return env;
}

describe('main', () => {
  it.each([
    ['unset', undefined],
    ['empty', ''],
  ])('FR-14 AC3: exits 1 naming WEATHERSTACK_KEY when the key is %s', async (_label, value) => {
    const { code, stderr } = await runMain(envWithKey(value));
    expect(code).toBe(1);
    expect(stderr).toContain('Missing required environment variable: WEATHERSTACK_KEY');
  });
});
