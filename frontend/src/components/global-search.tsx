'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';

import { SEARCH_TYPE_LABEL, type SearchResult, searchResultHref } from '@/lib/search';

const ROW =
  'flex items-center justify-between gap-space-sm rounded-sm px-2.5 py-1.5 text-body-default text-fg-muted ' +
  'outline-none hover:bg-surface-2 hover:text-fg aria-selected:bg-surface-2 aria-selected:text-fg';

/** The topbar's search box (s02-dashboard.html): ⌘K or Ctrl+K focuses it, results of
 * GET /search drop below it (decision N1). The shell owns the query; this only draws. */
export function GlobalSearch({
  query,
  onQueryChange,
  results,
  loading,
  failed,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  /** Null until a search has answered. */
  results: readonly SearchResult[] | null;
  loading: boolean;
  failed: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const items = results ?? [];
  const showing = open && query.trim() !== '';
  const close = () => {
    setOpen(false);
    setActive(0);
  };
  const pick = (result: SearchResult) => {
    close();
    onQueryChange('');
    router.push(searchResultHref(result));
  };

  return (
    <div
      className="relative hidden w-72 items-center lg:flex"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) close();
      }}
    >
      <span
        aria-hidden="true"
        className="material-symbols-outlined pointer-events-none absolute left-2.5 text-icon text-fg-faint"
      >
        search
      </span>
      <input
        ref={input}
        type="search"
        role="combobox"
        aria-label="Search programs, domains, URLs, findings and tool modules"
        aria-expanded={showing}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showing && items[active] ? `${listId}-${active}` : undefined}
        placeholder="Search programs, domains… (⌘K)"
        value={query}
        onChange={(event) => {
          onQueryChange(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            close();
          } else if (event.key === 'ArrowDown' && items.length > 0) {
            event.preventDefault();
            setActive((i) => (i + 1) % items.length);
          } else if (event.key === 'ArrowUp' && items.length > 0) {
            event.preventDefault();
            setActive((i) => (i - 1 + items.length) % items.length);
          } else if (event.key === 'Enter' && showing && items[active] !== undefined) {
            event.preventDefault();
            pick(items[active]);
          }
        }}
        className="h-8 w-full rounded-sm border border-border bg-surface-2 pr-12 pl-8 font-body-default text-body-default text-fg transition-all placeholder:text-fg-faint focus:border-primary-container focus:ring-1 focus:ring-primary-container focus:outline-none"
      />
      <kbd
        aria-hidden="true"
        className="pointer-events-none absolute right-2 rounded-sm border border-border bg-surface px-1 font-body-code text-caption text-fg-faint"
      >
        ⌘K
      </kbd>
      {showing ? (
        <div className="absolute top-full right-0 left-0 z-50 mt-1 rounded-lg border border-border bg-surface p-1 shadow-modal">
          {failed ? (
            <p role="alert" className="px-2.5 py-1.5 text-caption text-error">
              Search failed. Try again later.
            </p>
          ) : results === null || (loading && items.length === 0) ? (
            <p role="status" className="px-2.5 py-1.5 text-caption text-fg-faint">
              Searching…
            </p>
          ) : items.length === 0 ? (
            <p role="status" className="px-2.5 py-1.5 text-caption text-fg-faint">
              No matches.
            </p>
          ) : null}
          <ul id={listId} role="listbox" aria-label="Search results">
            {failed
              ? null
              : items.map((result, index) => (
                  <li
                    key={`${result.type}:${result.id}`}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === active}
                  >
                    <Link
                      href={searchResultHref(result)}
                      tabIndex={-1}
                      onClick={close}
                      onMouseEnter={() => setActive(index)}
                      className={ROW}
                    >
                      <span className="truncate font-body-code">{result.label}</span>
                      <span className="shrink-0 text-micro tracking-wider text-fg-faint uppercase">
                        {SEARCH_TYPE_LABEL[result.type]}
                      </span>
                    </Link>
                  </li>
                ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
