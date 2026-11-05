'use client';

import { type ReactElement, useState } from 'react';

import { Pagination, useCursorStack } from '@/components/pagination';
import { usePrograms } from '@/lib/programs';
import { type ScreenshotFilter, useScreenshots } from '@/lib/screenshots';

import { ScreenshotCard } from './screenshot-card';

/** Cards per page. The mockup's density select is the page size, sent as `limit`. */
const DENSITIES = [12, 24, 48, 96] as const;
const DEFAULT_DENSITY = 24;
/** Look-alike screenshots side by side: openapi.yaml, `GET /screenshots`. */
const SIMILAR = 'perception_hash';

const COUNT = new Intl.NumberFormat('en-US');

const FIELD =
  'h-8 rounded-sm border border-border-strong bg-surface-2 px-2.5 text-body-default font-medium text-fg hover:border-primary-container focus:outline-none focus:ring-2 focus:ring-ring';
const DENSITY_FIELD =
  'h-7 rounded-sm border border-border-strong bg-surface-2 px-2 font-body-code text-caption text-fg focus:outline-none focus:ring-2 focus:ring-ring';

export default function ScreenshotsPage(): ReactElement {
  const [programId, setProgramId] = useState<string | null>(null);
  const [similar, setSimilar] = useState(false);
  const [showFailed, setShowFailed] = useState(true);
  const [limit, setLimit] = useState<number>(DEFAULT_DENSITY);
  const { cursor, canGoBack, goNext, goBack, reset } = useCursorStack();
  const programs = usePrograms({ limit: 200 });
  const filter: ScreenshotFilter = {
    programId,
    sort: similar ? SIMILAR : null,
    limit,
    isFailed: showFailed ? null : false,
  };
  const shots = useScreenshots(filter, cursor);

  // Every cursor collected so far points into the previous result set.
  const change = (apply: () => void) => {
    apply();
    reset();
  };
  const filtered = programId !== null || similar || !showFailed;

  return (
    <div className="flex min-h-full w-full flex-col bg-bg">
      <div className="flex shrink-0 flex-col justify-between gap-space-lg border-b border-border bg-surface px-margin pb-space-lg pt-space-xl md:flex-row md:items-end">
        <div className="flex flex-col gap-1">
          <h1 className="text-headline-lg tracking-tight text-fg">Screenshot Gallery</h1>
          <p className="text-body-default text-fg-muted">
            {shots.data === undefined
              ? 'Screenshots taken by gowitness.'
              : `${shots.data.total_is_estimate ? 'About ' : ''}${COUNT.format(shots.data.total)} ${
                  shots.data.total === 1 ? 'screenshot' : 'screenshots'
                }.`}
          </p>
        </div>
        <div className="flex items-center gap-space-sm">
          <button
            type="button"
            disabled={!filtered}
            onClick={() =>
              change(() => {
                setProgramId(null);
                setSimilar(false);
                setShowFailed(true);
              })
            }
            className="flex h-9 items-center gap-1.5 rounded-sm border border-border-strong bg-surface-2 px-space-md text-body-default font-medium text-fg transition-colors hover:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[17px] text-fg-muted"
            >
              filter_alt_off
            </span>
            <span>Clear Filters</span>
          </button>
        </div>
      </div>

      <div className="z-30 shrink-0 border-b border-border bg-surface px-margin py-2.5 shadow-md">
        <div className="flex flex-wrap items-center gap-2">
          <label
            htmlFor="screenshot-program"
            className="flex items-center gap-space-sm text-body-default text-fg-muted"
          >
            Program
            <select
              id="screenshot-program"
              value={programId ?? ''}
              onChange={(e) =>
                change(() => setProgramId(e.target.value === '' ? null : e.target.value))
              }
              className={FIELD}
            >
              <option value="">All programs</option>
              {(programs.data?.items ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-border" />
          <button
            type="button"
            aria-pressed={similar}
            onClick={() => change(() => setSimilar((on) => !on))}
            className={`flex h-8 items-center gap-1.5 rounded-sm border px-2.5 text-body-default font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${
              similar
                ? 'border-accent-soft-bd bg-accent-soft text-primary shadow-sm ring-1 ring-ring'
                : 'border-border-strong bg-surface-2 text-fg hover:bg-surface-3'
            }`}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
              grain
            </span>
            <span>Group by Similar</span>
          </button>
          <label
            htmlFor="screenshot-show-failed"
            className="flex cursor-pointer select-none items-center gap-2 pl-1"
          >
            {/* A native checkbox drawn as the mockup's switch: keyboard and screen readers
                still get a checkbox. */}
            <span className="relative flex">
              <input
                id="screenshot-show-failed"
                type="checkbox"
                checked={showFailed}
                onChange={(e) => {
                  const on = e.target.checked;
                  change(() => setShowFailed(on));
                }}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className="h-[18px] w-8 rounded-full border border-border-strong bg-surface-2 transition-colors peer-checked:border-primary-container peer-checked:bg-primary-container peer-focus-visible:ring-2 peer-focus-visible:ring-ring"
              />
              <span
                aria-hidden="true"
                className="absolute left-0.5 top-0.5 h-3.5 w-3.5 rounded-full bg-fg transition-transform peer-checked:translate-x-3.5 peer-checked:bg-accent-ink"
              />
            </span>
            <span className="text-caption text-fg-muted">Show Failed</span>
          </label>
        </div>
      </div>

      <div className="flex-1 px-margin py-gutter">
        {shots.isPending && (
          <p className="text-body-default text-fg-muted">Loading the screenshots…</p>
        )}
        {shots.isError && (
          // A failed background refetch keeps the last good page below this message.
          <p role="alert" className="text-body-default text-crit">
            Could not load the screenshots.
          </p>
        )}
        {shots.data !== undefined && shots.data.items.length === 0 && (
          <p className="text-body-default text-fg-muted">
            {filtered ? 'No screenshots match these filters.' : 'No screenshots yet.'}
          </p>
        )}
        {shots.data !== undefined && shots.data.items.length > 0 && (
          <div className="grid gap-gutter [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
            {shots.data.items.map((shot) => (
              <ScreenshotCard key={shot.id} shot={shot} />
            ))}
          </div>
        )}
      </div>

      <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-space-md border-t border-border bg-surface px-margin font-body-code text-caption text-fg-muted">
        {shots.data !== undefined && (
          <Pagination
            label="Screenshot pagination"
            page={{
              total: shots.data.total,
              totalIsEstimate: shots.data.total_is_estimate,
              nextCursor: shots.data.next_cursor,
            }}
            canGoBack={canGoBack}
            onBack={goBack}
            onNext={() => goNext(shots.data.next_cursor)}
          />
        )}
        <label
          htmlFor="screenshot-density"
          className="flex items-center gap-2 font-body-code text-caption text-fg-muted"
        >
          Density
          <select
            id="screenshot-density"
            value={limit}
            onChange={(e) => change(() => setLimit(Number(e.target.value)))}
            className={DENSITY_FIELD}
          >
            {DENSITIES.map((d) => (
              <option key={d} value={d}>
                {d} / page
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
