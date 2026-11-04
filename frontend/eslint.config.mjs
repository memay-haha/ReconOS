import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

const config = [
  {
    ignores: [
      '.next/**',
      'coverage/**',
      'node_modules/**',
      'playwright-report/**',
      'public/mockServiceWorker.js',
    ],
  },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // frontend/CLAUDE.md forbids the any type.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
];

export default config;
