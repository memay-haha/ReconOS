'use client';

import { useCallback, useState } from 'react';
import type { ReactElement } from 'react';

export interface PageInfo {
  readonly total: number;
  readonly totalIsEstimate: boolean;
  readonly nextCursor: string | null;
}

/** Keyset pagination moves one page at a time, so the cursors already visited
 * are the only way back. An empty stack is the first page, whose cursor is null.
 * Call `reset` when a filter changes: every cursor collected so far is then
 * invalid. Reloading the same list must not reset it. */
export function useCursorStack(): {
  cursor: string | null;
  canGoBack: boolean;
  goNext: (next: string | null) => void;
  goBack: () => void;
  reset: () => void;
} {
  const [stack, setStack] = useState<readonly string[]>([]);

  const goNext = useCallback((next: string | null) => {
    if (next === null) return;
    // A double click, or a caller still holding the previous page's cursor,
    // must not push the same cursor twice: that would cost the reader two clicks to go back.
    setStack((current) => (current.at(-1) === next ? current : [...current, next]));
  }, []);
  const goBack = useCallback(() => setStack((current) => current.slice(0, -1)), []);
  const reset = useCallback(() => setStack([]), []);

  return {
    cursor: stack.at(-1) ?? null,
    canGoBack: stack.length > 0,
    goNext,
    goBack,
    reset,
  };
}

const COUNT = new Intl.NumberFormat('en-US');

// The mockups' table footers: a mono caption count on the left, small bordered buttons on
// the right (s04, s12).
const BUTTON =
  'h-7 rounded-sm border border-border bg-surface-2 px-2 font-body-code text-caption ' +
  'text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg ' +
  'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-surface-2';

export function Pagination({
  page,
  canGoBack,
  onBack,
  onNext,
  label,
  shown,
}: {
  /** Required so that a page with several lists never has two pagers a screen reader cannot tell apart. */
  label: string;
  page: PageInfo;
  canGoBack: boolean;
  onBack: () => void;
  onNext: () => void;
  /** Rows on this page. Given, the count reads "Showing 24 of 1,234" as the mockups do. */
  shown?: number;
}): ReactElement {
  const total = COUNT.format(page.total);
  const rows = page.total === 1 ? 'row' : 'rows';
  // The visible word comes first in the accessible name (WCAG 2.5.3 label in name).
  const named = (word: string) => `${word}, ${label.toLowerCase()}`;
  return (
    <nav
      aria-label={label}
      className="flex flex-wrap items-center justify-between gap-gutter py-space-sm"
    >
      <span className="font-body-code text-caption text-fg-faint">
        {shown === undefined
          ? page.totalIsEstimate
            ? `About ${total} ${rows}`
            : `${total} ${rows}`
          : `Showing ${COUNT.format(shown)} of ${page.totalIsEstimate ? 'about ' : ''}${total}`}
      </span>
      <span className="flex gap-space-sm">
        <button
          type="button"
          aria-label={named('Previous')}
          onClick={onBack}
          disabled={!canGoBack}
          className={BUTTON}
        >
          Previous
        </button>
        <button
          type="button"
          aria-label={named('Next')}
          onClick={onNext}
          disabled={page.nextCursor === null}
          className={BUTTON}
        >
          Next
        </button>
      </span>
    </nav>
  );
}
