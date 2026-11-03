import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Standalone output keeps the runtime image small: docs/ops/deployment.md
  output: 'standalone',
  reactStrictMode: true,
};

export default nextConfig;
