import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

// End-to-end tests run against the local stack: `bash dev/tools/start-all.sh` first.
const systemChromium = '/opt/pw-browsers/chromium';
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173',
    viewport: { width: 1366, height: 900 },
    launchOptions: existsSync(systemChromium) ? { executablePath: systemChromium } : {},
  },
});
