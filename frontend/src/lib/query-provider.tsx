'use client';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';

import { ApiError } from './api-client';

/** S01, where an operator whose session ended signs in again. */
export const SIGN_IN_PATH = '/login';

/** A 4xx is an answer, not a failure to reach the server; everything else gets two retries. */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status < 500) return false;
  return failureCount < 2;
}

/** 401 is the one status that means the session itself is gone.
 *
 * A 403 is an answer about one resource the account may not touch, so the screen keeps
 * showing it: signing in again would not change that answer.
 */
export function isSessionExpired(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

export interface SessionAwareClient {
  /** The client every query and mutation on the screen goes through. */
  readonly client: QueryClient;
  /** Call on every navigation. The 401 handler reads the path at the moment it fires,
   * because the client outlives every navigation. */
  readonly onScreenChange: (path: string) => void;
}

/** Builds the client and handles an ended session in one place, so no screen has to
 * recognise a 401 panel by panel.
 *
 * `goToSignIn` runs at most once per screen, after the cache is dropped.
 */
export function createSessionAwareClient(
  startPath: string,
  goToSignIn: () => void,
): SessionAwareClient {
  let path = startPath;
  let leaving = false;

  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetryQuery,
        staleTime: 30_000,
      },
    },
    queryCache: new QueryCache({ onError: (error) => handleError(error) }),
    mutationCache: new MutationCache({ onError: (error) => handleError(error) }),
  });

  function handleError(error: unknown): void {
    if (!isSessionExpired(error)) return;
    // S01 turns its own 401 into the wrong-credentials message. Sending it back to
    // itself would clear that message and loop the screen onto itself.
    if (path === SIGN_IN_PATH) return;
    // Three panels failing at once must still be one redirect, not three.
    if (leaving) return;
    leaving = true;
    // Nothing cached belongs to the session that just ended.
    client.clear();
    goToSignIn();
  }

  return {
    client,
    onScreenChange: (next: string) => {
      path = next;
      // A new screen means the previous redirect finished.
      leaving = false;
    },
  };
}

/** Resolves once the sample-data layer is up, and immediately outside development.
 * The import sits inside the NODE_ENV test so a production build removes the branch
 * and never emits the mock chunk. */
async function startSampleData(): Promise<void> {
  if (process.env.NODE_ENV !== 'development') return;
  const { startMocks } = await import('@/mocks/browser');
  await startMocks();
}

export function QueryProvider({ children }: { children: ReactNode }) {
  // First queries must not fire before the worker can answer them.
  const [mocksReady, setMocksReady] = useState(process.env.NODE_ENV !== 'development');
  useEffect(() => {
    if (mocksReady) return;
    // A broken worker must not blank the app: fall back to the real network.
    startSampleData()
      .catch((error: unknown) => {
        console.error(
          'Sample-data layer failed to start; requests go to the real API. Is /mockServiceWorker.js served?',
          error,
        );
      })
      .finally(() => setMocksReady(true));
  }, [mocksReady]);
  const router = useRouter();
  const pathname = usePathname();
  const [aware] = useState(() =>
    createSessionAwareClient(pathname, () => router.replace(SIGN_IN_PATH)),
  );

  useEffect(() => {
    aware.onScreenChange(pathname);
  }, [aware, pathname]);

  if (!mocksReady) return null;
  return <QueryClientProvider client={aware.client}>{children}</QueryClientProvider>;
}
