import { defineConfig } from '@playwright/test';

const baseURL = process.env.RECONOS_E2E_BASE_URL ?? 'http://127.0.0.1:3000';

export default defineConfig({
  testDir: './e2e',
  use: { baseURL, trace: 'on-first-retry' },
  webServer: {
    // Production build: dev mode blocks the 127.0.0.1 origin (HMR), so the page never hydrates.
    command: 'pnpm build && pnpm start --hostname 127.0.0.1 --port 3000',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 300_000,
  },
});
