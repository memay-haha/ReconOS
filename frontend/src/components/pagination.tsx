'use client';

import { useCallback, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';

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
  /** Pages behind the current one: the first row of this page is `depth * limit + 1`. */
  depth: number;
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
    depth: stack.length,
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

/** Rows-per-page choices of the mockups' footers. */
export const PAGE_SIZES = [10, 25, 50, 100] as const;

const SELECT =
  'h-7 rounded-sm border border-border bg-surface-2 px-1.5 font-body-code text-caption ' +
  'text-fg-muted focus:border-primary-container focus:outline-none';

function Count({ value }: { value: string }) {
  return <strong className="font-body-code font-medium text-fg">{value}</strong>;
}

export function Pagination({
  page,
  canGoBack,
  onBack,
  onNext,
  label,
  shown,
  start,
  noun,
  pageSize,
  onPageSizeChange,
  pageSizeLabel = 'Rows:',
  children,
}: {
  /** Required so that a page with several lists never has two pagers a screen reader cannot tell apart. */
  label: string;
  page: PageInfo;
  canGoBack: boolean;
  onBack: () => void;
  onNext: () => void;
  /** Rows on this page. Given, the count reads "Showing 24 of 1,234" as the mockups do. */
  shown?: number;
  /** 1-based position of the first row on this page (`depth * limit + 1`). Given with
   * `shown`, the count reads "Showing 26–50 of 1,234 domains" as the mockup footers do. */
  start?: number;
  /** What the rows are, plural: "domains", "records". */
  noun?: string;
  /** Given with `onPageSizeChange`, a rows-per-page select joins the buttons. */
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
  /** The select's visible label; the mockups say "Density:" on some screens. */
  pageSizeLabel?: string;
  /** Drawn after the count, as S12 puts its bulk actions there. */
  children?: ReactNode;
}): ReactElement {
  const total = COUNT.format(page.total);
  const rows = page.total === 1 ? 'row' : 'rows';
  const about = page.totalIsEstimate ? 'about ' : '';
  // The visible word comes first in the accessible name (WCAG 2.5.3 label in name).
  const named = (word: string) => `${word}, ${label.toLowerCase()}`;

  let count: ReactElement;
  if (shown !== undefined && start !== undefined) {
    const range = shown === 0 ? '0' : `${COUNT.format(start)}–${COUNT.format(start + shown - 1)}`;
    count = (
      <span className="font-body-default text-caption whitespace-nowrap text-fg-muted">
        Showing <Count value={range} /> of {about}
        <Count value={total} />
        {noun === undefined ? null : ` ${noun}`}
      </span>
    );
  } else {
    count = (
      <span className="font-body-code text-caption text-fg-faint">
        {shown === undefined
          ? page.totalIsEstimate
            ? `About ${total} ${rows}`
            : `${total} ${rows}`
          : `Showing ${COUNT.format(shown)} of ${about}${total}${noun === undefined ? '' : ` ${noun}`}`}
      </span>
    );
  }

  return (
    <nav
      aria-label={label}
      className="flex flex-wrap items-center justify-between gap-gutter py-space-sm"
    >
      {children === undefined ? (
        count
      ) : (
        <span className="flex flex-wrap items-center gap-space-sm">
          {count}
          {children}
        </span>
      )}
      <span className="flex items-center gap-space-sm">
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
        {pageSize === undefined || onPageSizeChange === undefined ? null : (
          <label className="flex items-center gap-1.5 font-body-code text-caption text-fg-faint">
            {pageSizeLabel}
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className={SELECT}
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        )}
      </span>
    </nav>
  );
}
