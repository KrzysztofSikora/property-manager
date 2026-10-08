import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const CI = process.env.CI !== undefined;
const REPO_ROOT = path.resolve(import.meta.dirname, '..');

// The stack comes from global setup, not `webServer`: Compose needs SIGTERM on stop, and
// `webServer` would start before global setup (plan *Findings*).
export default defineConfig({
  // Relative to this file. The default `*.spec.ts` match keeps `stub/` out.
  testDir: '.',
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  outputDir: path.join(REPO_ROOT, 'test-results'),
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: path.join(REPO_ROOT, 'playwright-report') }],
  ],
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  use: {
    baseURL: 'http://localhost:5180',
    // Locally every run keeps a trace for the report; CI only on the retry of a failure.
    trace: CI ? 'on-first-retry' : 'on',
  },
  // Chromium only (NG-11).
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
