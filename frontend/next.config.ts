import type { NextConfig } from 'next';

// The browser only ever talks to the Next origin. Next forwards /api/* to
// Backend API, which keeps Origin equal to RECONOS_PUBLIC_ORIGIN for the CSRF
// check and lets the SameSite=Lax session cookie travel: docs/api/architecture.md.
// Production routes /api/ at Nginx instead: docs/ops/deployment.md.
const apiUrl = process.env.RECONOS_API_URL ?? 'http://127.0.0.1:8000';

const nextConfig: NextConfig = {
  // Standalone output keeps the runtime image small: docs/ops/deployment.md
  output: 'standalone',
  reactStrictMode: true,
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
};

export default nextConfig;
