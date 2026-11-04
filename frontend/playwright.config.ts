import { defineConfig } from '@playwright/test';

const baseURL = process.env.RECONOS_E2E_BASE_URL ?? 'http://127.0.0.1:3000';
// Host and port come from baseURL so the server and the readiness check cannot disagree.
const { hostname, port } = new URL(baseURL);

export default defineConfig({
  testDir: './e2e',
  // A trace records typed values, so specs that type a real password turn it off (login.spec.ts).
  use: { baseURL, trace: 'on-first-retry' },
  webServer: {
    command: `pnpm dev --hostname ${hostname} --port ${port === '' ? '80' : port}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
