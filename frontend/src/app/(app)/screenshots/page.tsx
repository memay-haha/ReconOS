'use client';

import { type ReactElement, Suspense, useDeferredValue, useState } from 'react';

import { Pagination, useCursorStack } from '@/components/pagination';
import { useQueryParam } from '@/lib/url-params';
import { usePrograms } from '@/lib/programs';
import {
  type ScreenshotFilter,
  type StatusCodeClass,
  useScreenshotJobs,
  useScreenshots,
  useScreenshotSummary,
} from '@/lib/screenshots';
import { useToolModules } from '@/lib/tool-modules';
import { useTechnologies } from '@/lib/url-detail';

import { LoadScan, StatusChips, TechnologyFilter } from './gallery-filters';
import { QueuedCard, ScreenshotCard } from './screenshot-card';

/** Cards per page. The mockup's density select is the page size, sent as `limit`. */
const DENSITIES = [12, 24, 48, 96] as const;
const DEFAULT_DENSITY = 24;
/** Look-alike screenshots side by side: openapi.yaml, `GET /screenshots`. */
const SIMILAR = 'perception_hash';
/** The tool module that takes screenshots: docs/integrations/external-services.md. */
const GOWITNESS = 'gowitness';

const COUNT = new Intl.NumberFormat('en-US');

const FIELD =
  'h-8 rounded-sm border border-border-strong bg-surface-2 px-2.5 text-body-default font-medium text-fg hover:border-primary-container focus:outline-none focus:ring-2 focus:ring-ring';
const DENSITY_FIELD =
  'h-7 rounded-sm border border-border-strong bg-surface-2 px-2 font-body-code text-caption text-fg focus:outline-none focus:ring-2 focus:ring-ring';

/** The initial program comes from `?program_id=`; useSearchParams needs a Suspense boundary. */
export default function ScreenshotsPage(): ReactElement {
  return (
    <Suspense>
      <ScreenshotsScreen />
    </Suspense>
  );
}

function ScreenshotsScreen(): ReactElement {
  const [programId, setProgramId] = useState<string | null>(useQueryParam('program_id'));
  const [technologyIds, setTechnologyIds] = useState<readonly string[]>([]);
  const [statusCodes, setStatusCodes] = useState<readonly StatusCodeClass[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [similar, setSimilar] = useState(false);
  const [showFailed, setShowFailed] = useState(true);
  const [limit, setLimit] = useState<number>(DEFAULT_DENSITY);
  const { cursor, canGoBack, depth, goNext, goBack, reset } = useCursorStack();
  const q = useDeferredValue(search.trim());

  const programs = usePrograms({ limit: 200 });
  const technologies = useTechnologies();
  const toolModules = useToolModules();
  const gowitnessId = toolModules.data?.items.find((m) => m.name === GOWITNESS)?.id ?? null;

  const filter: ScreenshotFilter = {
    programId,
    technologyIds,
    statusCodes,
    jobId,
    q: q === '' ? null : q,
    sort: similar ? SIMILAR : null,
    limit,
    isFailed: showFailed ? null : false,
  };
  const shots = useScreenshots(filter, cursor);
  const summary = useScreenshotSummary(filter);
  const narrowed = jobId !== null || technologyIds.length > 0 || statusCodes.length > 0 || q !== '';
  // Jobs that have not produced their screenshots yet lead the first page (N16).
  const waiting = useScreenshotJobs({
    toolModuleId: cursor === null && !narrowed ? gowitnessId : null,
    statuses: ['queued', 'dispatched', 'running'],
    programId,
    limit: 4,
  });

  // Every cursor collected so far points into the previous result set.
  const change = (apply: () => void) => {
    apply();
    reset();
  };
  const filtered = programId !== null || similar || !showFailed || narrowed;
  const start = depth * limit;
  const items = shots.data?.items ?? [];
  const queued = cursor === null && !narrowed ? (waiting.data?.items ?? []) : [];
  const picked = jobId === null ? null : jobId.slice(0, 8);

  return (
    <div className="flex min-h-full w-full flex-col bg-bg">
      <div className="flex shrink-0 flex-col justify-between gap-space-lg border-b border-border bg-surface px-margin pb-space-lg pt-space-xl md:flex-row md:items-end">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-space-sm text-label-caps uppercase tracking-wider text-fg-muted">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-primary-container" />
            <span>Recon</span>
            <span aria-hidden="true">/</span>
            <span className="font-body-code text-primary">Screenshots</span>
          </div>
          <h1 className="text-headline-lg tracking-tight text-fg">Screenshot Gallery</h1>
          <p className="text-body-default text-fg-muted">
            {shots.data === undefined
              ? 'Screenshots taken by gowitness.'
              : `${shots.data.total_is_estimate ? 'About ' : ''}${COUNT.format(shots.data.total)} ${
                  shots.data.total === 1 ? 'screenshot' : 'screenshots'
                }${picked === null ? ' across the programs you can see.' : ` from job ${picked}.`}`}
          </p>
        </div>
        <div className="flex items-center gap-space-sm">
          <button
            type="button"
            disabled={!filtered}
            onClick={() =>
              change(() => {
                setProgramId(null);
                setTechnologyIds([]);
                setStatusCodes([]);
                setJobId(null);
                setSearch('');
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
          <LoadScan
            gowitnessId={gowitnessId}
            programId={programId}
            onPick={(id) => change(() => setJobId(id))}
          />
        </div>
      </div>

      <div className="z-30 shrink-0 border-b border-border bg-surface px-margin py-2.5 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-space-md">
          <div className="flex flex-wrap items-center gap-2">
            <label
              htmlFor="screenshot-program"
              className="flex items-center gap-space-sm text-body-default text-fg-muted"
            >
              <span className="sr-only">Program</span>
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
            <TechnologyFilter
              options={technologies.data?.items ?? []}
              selected={technologyIds}
              onChange={(ids) => change(() => setTechnologyIds(ids))}
            />
            <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-border" />
            <StatusChips
              counts={summary.data?.by_status_code ?? {}}
              selected={statusCodes}
              onToggle={(c) =>
                change(() =>
                  setStatusCodes((on) => (on.includes(c) ? on.filter((x) => x !== c) : [...on, c])),
                )
              }
            />
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
            {picked !== null && (
              <button
                type="button"
                onClick={() => change(() => setJobId(null))}
                aria-label={`Stop showing only job ${picked}`}
                className="flex h-7 items-center gap-1 rounded-sm border border-accent-soft-bd bg-accent-soft px-2 font-body-code text-caption text-primary focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <span>Job {picked}</span>
                <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
                  close
                </span>
              </button>
            )}
          </div>
          <div className="ml-auto flex items-center gap-space-sm">
            <div className="relative w-full sm:w-52 2xl:w-72">
              <span
                aria-hidden="true"
                className="material-symbols-outlined pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-fg-muted"
              >
                travel_explore
              </span>
              <input
                type="search"
                aria-label="Search page title or URL"
                placeholder="Search page title or URL…"
                value={search}
                onChange={(e) => {
                  const value = e.target.value;
                  change(() => setSearch(value));
                }}
                className="h-8 w-full rounded-sm border border-border-strong bg-surface-2 pl-8 pr-3 font-body-code text-caption text-fg placeholder:text-fg-muted focus:border-primary-container focus:outline-none focus:ring-1 focus:ring-primary-container"
              />
            </div>
          </div>
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
        {shots.data !== undefined && items.length === 0 && queued.length === 0 && (
          <p className="text-body-default text-fg-muted">
            {filtered ? 'No screenshots match these filters.' : 'No screenshots yet.'}
          </p>
        )}
        {(items.length > 0 || queued.length > 0) && (
          <div className="grid gap-gutter [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
            {queued.map((job) => (
              <QueuedCard key={job.id} job={job} />
            ))}
            {items.map((shot, i) => (
              <ScreenshotCard
                key={shot.id}
                shot={shot}
                position={start + i + 1}
                gowitnessId={gowitnessId}
              />
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
            shown={items.length}
            start={start + 1}
            noun="screenshots"
            canGoBack={canGoBack}
            onBack={goBack}
            onNext={() => goNext(shots.data.next_cursor)}
          />
        )}
        <label
          htmlFor="screenshot-density"
          className="flex items-center gap-2 font-body-code text-caption text-fg-muted"
        >
          Density:
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
