'use client';

import { useCallback, useSyncExternalStore } from 'react';

/** Columns a reader hid on a table, kept in this browser only (localStorage): a view
 * preference, not data, so it never goes to Backend API. */
const PREFIX = 'reconos.columns.';
const listeners = new Set<() => void>();

function read(key: string): string {
  try {
    return window.localStorage.getItem(PREFIX + key) ?? '';
  } catch {
    return '';
  }
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  window.addEventListener('storage', notify);
  return () => {
    listeners.delete(notify);
    window.removeEventListener('storage', notify);
  };
}

/** Hidden columns of table `key` and a toggle. The server render shows every column. */
export function useHiddenColumns(key: string): {
  hidden: ReadonlySet<string>;
  toggle: (column: string) => void;
} {
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => '',
  );
  const hidden: ReadonlySet<string> = new Set(raw === '' ? [] : raw.split('\n'));
  const toggle = useCallback(
    (column: string) => {
      const next = new Set(read(key) === '' ? [] : read(key).split('\n'));
      if (next.has(column)) next.delete(column);
      else next.add(column);
      try {
        window.localStorage.setItem(PREFIX + key, [...next].join('\n'));
      } catch {
        // Storage off (private mode): the choice lasts until the page reloads at most.
      }
      for (const notify of listeners) notify();
    },
    [key],
  );
  return { hidden, toggle };
}
