'use client';

import { type ReactElement, useEffect, useRef, useState } from 'react';

import { formatMoment } from '@/lib/format-moment';
import { STATUS_CLASSES, type StatusCodeClass, useScreenshotJobs } from '@/lib/screenshots';
import type { Technology } from '@/lib/url-detail';

import { CLASS_ICON, CLASS_TONE, STATUS_TONE } from './http-status';

const COUNT = new Intl.NumberFormat('en-US');
const POPOVER =
  'absolute left-0 top-full z-40 mt-1 flex max-h-72 w-64 flex-col overflow-y-auto rounded-sm border border-border-strong bg-surface-container p-1.5 shadow-modal';
const FOCUS = 'focus:outline-none focus:ring-2 focus:ring-ring';

/** Closes a popover on Escape or a click outside `ref`. Listeners only, no API call. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onDown = (e: MouseEvent) => {
      if (ref.current !== null && e.target instanceof Node && !ref.current.contains(e.target)) {
        close();
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open, close]);
  return ref;
}

/** The Technologies multi-select: options from `GET /technologies`, sent as repeated
 * `technology_id`. Names come from scan output: text only. */
export function TechnologyFilter({
  options,
  selected,
  onChange,
}: {
  options: readonly Technology[];
  selected: readonly string[];
  onChange: (ids: readonly string[]) => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const names = options.filter((t) => selected.includes(t.id)).map((t) => t.name);
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);

  return (
    <div ref={ref} className="relative flex items-center">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
        className={`flex h-8 items-center gap-2 rounded-sm border border-border-strong bg-surface-2 px-2.5 text-body-default text-fg transition-colors hover:border-primary-container ${FOCUS}`}
      >
        <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-primary">
          memory
        </span>
        <span className="font-medium">Technologies</span>
        {selected.length > 0 && (
          <span className="rounded-full bg-accent-soft px-1.5 font-body-code text-caption font-semibold text-primary">
            {selected.length}
          </span>
        )}
        <span aria-hidden="true" className="material-symbols-outlined text-[15px] text-fg-muted">
          expand_more
        </span>
      </button>
      {names.length > 0 && (
        <span className="ml-1 hidden max-w-[220px] truncate rounded-sm border border-border bg-surface-3 px-2 py-1 font-body-code text-caption text-primary sm:inline">
          {names.join(', ')}
        </span>
      )}
      {open && (
        <fieldset className={POPOVER}>
          <legend className="sr-only">Technologies</legend>
          {options.length === 0 && (
            <p className="px-2 py-1 text-caption text-fg-muted">No technologies detected yet.</p>
          )}
          {options.map((t) => (
            <label
              key={t.id}
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-body-default text-fg hover:bg-surface-3"
            >
              <input
                type="checkbox"
                checked={selected.includes(t.id)}
                onChange={() => toggle(t.id)}
                className="accent-primary-container"
              />
              <span className="truncate">{t.name}</span>
              {t.category !== null && (
                <span className="ml-auto truncate text-caption text-fg-muted">{t.category}</span>
              )}
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}

/** One chip per HTTP status class with screenshots in the current filter (M14). */
export function StatusChips({
  counts,
  selected,
  onToggle,
}: {
  counts: Readonly<Partial<Record<StatusCodeClass, number>>>;
  selected: readonly StatusCodeClass[];
  onToggle: (c: StatusCodeClass) => void;
}): ReactElement {
  // A class toggled on stays visible even when another filter empties it.
  const shown = STATUS_CLASSES.filter((c) => (counts[c] ?? 0) > 0 || selected.includes(c));
  return (
    <div className="inline-flex items-center gap-1">
      {shown.map((c) => {
        const on = selected.includes(c);
        return (
          <button
            key={c}
            type="button"
            aria-pressed={on}
            title={`Filter HTTP ${c}`}
            onClick={() => onToggle(c)}
            className={`flex h-7 items-center gap-1.5 rounded-sm border px-2 font-body-code text-caption font-semibold transition-all ${FOCUS} ${STATUS_TONE[CLASS_TONE[c]]} ${on ? 'ring-1 ring-ring' : 'opacity-80 hover:opacity-100'}`}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
              {CLASS_ICON[c]}
            </span>
            <span>{c}</span>
            <span className="ml-0.5 text-[10px] font-normal">{COUNT.format(counts[c] ?? 0)}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Load Scan (N15): picks one finished gowitness job and filters the gallery by `job_id`. */
export function LoadScan({
  gowitnessId,
  programId,
  onPick,
}: {
  gowitnessId: string | null;
  programId: string | null;
  onPick: (jobId: string) => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const jobs = useScreenshotJobs({
    toolModuleId: open ? gowitnessId : null,
    statuses: ['completed', 'failed'],
    programId,
    limit: 20,
  });

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        disabled={gowitnessId === null}
        onClick={() => setOpen((o) => !o)}
        className={`flex h-9 items-center gap-1.5 rounded-sm bg-primary-container px-space-md text-body-default font-semibold text-accent-ink shadow-sm transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS}`}
      >
        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
          sync_alt
        </span>
        <span>Load Scan</span>
      </button>
      {open && (
        <div className={`${POPOVER} left-auto right-0 w-72`}>
          <p className="px-2 py-1 text-label-caps uppercase tracking-wider text-fg-muted">
            gowitness jobs
          </p>
          {jobs.isPending && <p className="px-2 py-1 text-caption text-fg-muted">Loading…</p>}
          {jobs.isError && (
            <p role="alert" className="px-2 py-1 text-caption text-crit">
              Could not load the gowitness jobs.
            </p>
          )}
          {jobs.data?.items.length === 0 && (
            <p className="px-2 py-1 text-caption text-fg-muted">No finished gowitness job.</p>
          )}
          {jobs.data?.items.map((j) => (
            <button
              key={j.id}
              type="button"
              onClick={() => {
                onPick(j.id);
                setOpen(false);
              }}
              className={`flex flex-col items-start rounded-sm px-2 py-1.5 text-left hover:bg-surface-3 ${FOCUS}`}
            >
              <span className="font-body-code text-caption text-fg">
                {formatMoment(j.finished_at ?? j.created_at)}
              </span>
              <span className="text-caption text-fg-muted">
                {j.target.length} {j.target.length === 1 ? 'target' : 'targets'} · Job{' '}
                {j.id.slice(0, 8)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
