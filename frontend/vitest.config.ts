import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // Node's built-in localStorage shadows jsdom's and is unusable without a file.
    execArgv: ['--no-experimental-webstorage'],
    setupFiles: ['./vitest.setup.ts'],
    // Unit tests sit next to the code; e2e belongs to Playwright.
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
