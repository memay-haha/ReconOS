import { defineConfig } from '@playwright/test';

const baseURL = process.env.RECONOS_E2E_BASE_URL ?? 'http://127.0.0.1:3000';

export default defineConfig({
  testDir: './e2e',
  use: { baseURL, trace: 'on-first-retry' },
  webServer: {
    command: 'pnpm dev --hostname 127.0.0.1 --port 3000',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
