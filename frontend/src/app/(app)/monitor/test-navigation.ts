import { useSyncExternalStore } from 'react';
import { vi } from 'vitest';

/** A next/navigation stand-in whose search params follow `router.replace`, so a screen that
 * keeps its tab in the URL re-renders as in the browser. */
let search = new URLSearchParams();
const listeners = new Set<() => void>();

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

export function setSearch(query: string): void {
  search = new URLSearchParams(query);
  for (const notify of listeners) notify();
}

export const replace = vi.fn((url: string) => setSearch(url.split('?')[1] ?? ''));

export const navigationMock = {
  useRouter: () => ({ push: vi.fn(), replace }),
  usePathname: () => '/monitor',
  useSearchParams: () =>
    useSyncExternalStore(
      subscribe,
      () => search,
      () => search,
    ),
};
