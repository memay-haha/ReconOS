/** Stand-in for `msw/browser` in the graphs that never run it (SSR, Server Components).
 * See `turbopack.resolveAlias` in next.config.ts. */
export const setupWorker = (): never => {
  throw new Error('msw/browser is only available in the browser');
};
