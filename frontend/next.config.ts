import { readFileSync } from 'node:fs';

import type { NextConfig } from 'next';

// The browser only ever talks to the Next origin. Next forwards /api/* to
// Backend API, which keeps Origin equal to RECONOS_PUBLIC_ORIGIN for the CSRF
// check and lets the SameSite=Lax session cookie travel: docs/api/architecture.md.
// Production routes /api/ at Nginx instead: docs/ops/deployment.md.
const apiUrl = process.env.RECONOS_API_URL ?? 'http://127.0.0.1:8000';

// Stamped into the bundle at build time, never read from Backend API: the version for every
// version chip and the S01 node chip (frontend/CLAUDE.md, docs/ops/configuration.md).
const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as {
  version: string;
};

const nextConfig: NextConfig = {
  env: {
    RECONOS_VERSION: version,
    RECONOS_NODE_NAME: process.env.RECONOS_NODE_NAME ?? '',
  },
  // Standalone output keeps the runtime image small: docs/ops/deployment.md
  output: 'standalone',
  reactStrictMode: true,
  // The end-to-end suite and the /api rewrite address the app at 127.0.0.1. Without
  // this, `next dev` blocks that origin (HMR) and the login page never hydrates.
  allowedDevOrigins: ['127.0.0.1'],
  turbopack: {
    // msw's export map sets "node": null on ./browser, and Turbopack resolves that
    // subpath under the node condition when it builds the SSR and Server Component
    // graphs (and fails the whole compile). Only the browser graph gets the real
    // file; every other graph gets an empty stub that nothing executes. The mock
    // layer itself is still behind the NODE_ENV test in query-provider.tsx, so
    // neither file reaches a production build: scripts/check-no-mocks.mjs verifies it.
    resolveAlias: {
      'msw/browser': {
        browser: './node_modules/msw/lib/browser/index.js',
        default: './src/mocks/empty-browser.ts',
      },
    },
  },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
};

export default nextConfig;
