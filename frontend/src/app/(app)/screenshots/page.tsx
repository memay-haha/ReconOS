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
  'h-8 rounded-sm border border-border-strong bg-surface-2 px-space-sm text-body-default text-fg focus:outline-none focus:ring-2 focus:ring-ring';

export default function ScreenshotsPage(): ReactElement {
  const [programId, setProgramId] = useState<string | null>(null);
  const [similar, setSimilar] = useState(false);
  const [limit, setLimit] = useState<number>(DEFAULT_DENSITY);
  const { cursor, canGoBack, goNext, goBack, reset } = useCursorStack();
  const programs = usePrograms({ limit: 200 });
  const filter: ScreenshotFilter = { programId, sort: similar ? SIMILAR : null, limit };
  const shots = useScreenshots(filter, cursor);

  // Every cursor collected so far points into the previous result set.
  const change = (apply: () => void) => {
    apply();
    reset();
  };
  const filtered = programId !== null || similar;

  return (
    <div className="flex w-full flex-col">
      <div className="flex flex-col justify-between gap-space-md border-b border-border bg-surface px-space-lg pb-space-lg pt-space-xl md:flex-row md:items-end">
        <div className="flex flex-col gap-space-xs">
          <h1 className="text-headline-lg text-fg">Screenshot Gallery</h1>
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
              })
            }
            className="h-9 rounded-sm border border-border-strong bg-surface-2 px-space-md text-body-default text-fg hover:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            Clear Filters
          </button>
        </div>
      </div>

      <div className="border-b border-border bg-surface px-space-lg py-space-sm">
        <div className="flex flex-wrap items-center gap-space-sm">
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
          <button
            type="button"
            aria-pressed={similar}
            onClick={() => change(() => setSimilar((on) => !on))}
            className={`flex h-8 items-center gap-space-xs rounded-sm border px-space-sm text-body-default focus:outline-none focus:ring-2 focus:ring-ring ${
              similar
                ? 'border-accent-soft-bd bg-accent-soft text-primary'
                : 'border-border-strong bg-surface-2 text-fg'
            }`}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-icon">
              grain
            </span>
            <span>Group by Similar</span>
          </button>
        </div>
      </div>

      <div className="px-space-lg py-space-md">
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
          <div className="grid grid-cols-1 gap-gutter sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {shots.data.items.map((shot) => (
              <ScreenshotCard key={shot.id} shot={shot} />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-space-md border-t border-border bg-surface px-space-lg">
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
          className="flex items-center gap-space-sm text-body-default text-fg-muted"
        >
          Density
          <select
            id="screenshot-density"
            value={limit}
            onChange={(e) => change(() => setLimit(Number(e.target.value)))}
            className={FIELD}
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
