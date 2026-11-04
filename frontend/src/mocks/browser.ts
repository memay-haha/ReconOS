import { setupWorker } from 'msw/browser';

import { handlersFor, IMPLEMENTED } from './registry';

/** Starts the mock layer, and only ever in development. The guard is on
 * NODE_ENV rather than a custom flag so a production build cannot turn it on
 * by accident: Next replaces NODE_ENV at build time and the whole body is
 * dropped from the bundle. */
export async function startMocks(): Promise<void> {
  if (process.env.NODE_ENV !== 'development') return;
  const worker = setupWorker(...handlersFor(IMPLEMENTED));
  await worker.start({ onUnhandledFrame: 'bypass', quiet: true });
}
