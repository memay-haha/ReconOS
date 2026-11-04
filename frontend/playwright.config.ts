import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { defineConfig } from '@playwright/test';

const KEY_VALUE = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/;

/**
 * Reads named variables out of an env file without pouring the rest into `process.env`.
 * The repo `.env` also holds database passwords and encryption keys, and the dev server
 * Playwright starts inherits whatever this process carries, so it takes only what it asks for.
 */
function readKeys(path: string, keys: readonly string[]): Record<string, string> {
  const found: Record<string, string> = {};
  if (!existsSync(path)) return found;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = KEY_VALUE.exec(line);
    if (match === null || !keys.includes(match[1])) continue;
    found[match[1]] = match[2].trim().replace(/^(['"])([\s\S]*)\1$/, '$2');
  }
  return found;
}

// Playwright runs in its own process and reads no env file on its own, so a filled-in
// frontend/.env never reached the specs: the suite failed on a clean checkout as if it
// were broken rather than unconfigured. Values already in the environment still win.
const frontendEnv = fileURLToPath(new URL('.env', import.meta.url));
if (existsSync(frontendEnv)) process.loadEnvFile(frontendEnv);

// The suite signs in as the Superadmin `make init` bootstrapped, so naming the account
// twice is the only thing a clean checkout would have to do. Take it from the repo .env
// that created the account instead: docs/ops/configuration.md.
const bootstrap = readKeys(fileURLToPath(new URL('../.env', import.meta.url)), [
  'RECONOS_BOOTSTRAP_ADMIN_USERNAME',
  'RECONOS_BOOTSTRAP_ADMIN_PASSWORD',
]);
if ((process.env.RECONOS_E2E_USERNAME ?? '') === '') {
  process.env.RECONOS_E2E_USERNAME = bootstrap.RECONOS_BOOTSTRAP_ADMIN_USERNAME ?? '';
}
if ((process.env.RECONOS_E2E_PASSWORD ?? '') === '') {
  process.env.RECONOS_E2E_PASSWORD = bootstrap.RECONOS_BOOTSTRAP_ADMIN_PASSWORD ?? '';
}

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
