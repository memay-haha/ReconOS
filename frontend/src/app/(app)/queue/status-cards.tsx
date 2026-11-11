'use client';

import type { ReactElement } from 'react';

import { JOB_STATUS_LABEL, JOB_STATUSES, type JobStatus, useJobs } from '@/lib/jobs';

import { type Figure, totalOf } from '../programs/stat-tile';
import { COUNT } from '../programs/ui';
import { STATUS_FILL, STATUS_LABEL_TEXT, STATUS_TEXT } from './status-tone';

const CARD: Readonly<Record<JobStatus, { icon: string; note: string }>> = {
  pending_approval: { icon: 'gavel', note: 'Awaiting approval' },
  queued: { icon: 'hourglass_top', note: 'Awaiting worker slot' },
  dispatched: { icon: 'outbox', note: 'Sent to workers' },
  running: { icon: 'sync', note: 'Active execution' },
  completed: { icon: 'check_circle', note: 'Finished' },
  failed: { icon: 'error', note: 'Requires triage' },
  cancelled: { icon: 'block', note: 'Ended before finishing' },
};

/** The mockup's cards after Total Jobs. Pending approval and Cancelled stay in the pipeline
 * legend and the status filter (M7: the mockup draws five status cards). */
const CARD_STATUSES: readonly JobStatus[] = [
  'queued',
  'dispatched',
  'running',
  'completed',
  'failed',
];

/** One status count. limit=1: only `total` is read, the same count the sidebar badge uses;
 * the cards and the pipeline bar share the query, so it is fetched once. */
function useStatusTotal(status: JobStatus | null): Figure {
  return totalOf(useJobs(status === null ? { limit: 1 } : { status, limit: 1 }));
}

/** Completed over completed plus failed: the mockup's "97.1% success". */
function useSuccessNote(): string | null {
  const completed = useStatusTotal('completed');
  const failed = useStatusTotal('failed');
  if (completed == null || failed == null || completed + failed === 0) return null;
  return `${((completed / (completed + failed)) * 100).toFixed(1)}% success`;
}

function TotalCard(): ReactElement {
  const value = useStatusTotal(null);
  return (
    <div
      data-stat-tile
      className="relative flex flex-col justify-between overflow-hidden rounded-sm border border-border bg-surface p-space-md"
    >
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-fg-muted" />
      <div className="flex items-start justify-between gap-space-xs">
        <span className="font-label-caps text-label-caps uppercase tracking-wider text-fg-faint">
          Total jobs
        </span>
        <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-fg-muted">
          stacked_bar_chart
        </span>
      </div>
      <div className="my-1.5">
        {value === undefined ? (
          <p className="text-body-default text-fg-muted">Loading…</p>
        ) : value === null ? (
          <p className="text-body-default text-fg-muted">Unavailable</p>
        ) : (
          <p className="font-stat-lg text-stat-lg tracking-tight text-fg">{COUNT.format(value)}</p>
        )}
      </div>
      <p className="flex items-center justify-between gap-1 font-caption text-caption text-fg-faint">
        <span className="truncate">Every status</span>
        <span className="font-body-code">100%</span>
      </p>
    </div>
  );
}

function StatusCard({ status }: { status: JobStatus }): ReactElement {
  const value = useStatusTotal(status);
  const success = useSuccessNote();
  const note = status === 'completed' && success !== null ? success : CARD[status].note;
  return (
    <div
      data-stat-tile
      className="relative flex flex-col justify-between overflow-hidden rounded-sm border border-border bg-surface p-space-md"
    >
      <div aria-hidden="true" className={`absolute inset-x-0 top-0 h-0.5 ${STATUS_FILL[status]}`} />
      <div className="flex items-start justify-between gap-space-xs">
        <span
          className={`font-label-caps text-label-caps uppercase tracking-wider ${STATUS_LABEL_TEXT[status]}`}
        >
          {JOB_STATUS_LABEL[status]}
        </span>
        <span
          aria-hidden="true"
          className={`material-symbols-outlined text-[16px] ${STATUS_TEXT[status]}`}
        >
          {CARD[status].icon}
        </span>
      </div>
      <div className="my-1.5">
        {value === undefined ? (
          <p className="text-body-default text-fg-muted">Loading…</p>
        ) : value === null ? (
          <p className="text-body-default text-fg-muted">Unavailable</p>
        ) : (
          <p className={`font-stat-lg text-stat-lg tracking-tight ${STATUS_TEXT[status]}`}>
            {COUNT.format(value)}
          </p>
        )}
      </div>
      <p
        className={`flex items-center gap-1 truncate font-caption text-caption ${STATUS_TEXT[status]}`}
      >
        <span
          aria-hidden="true"
          className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_FILL[status]}`}
        />
        <span className="truncate">{note}</span>
      </p>
    </div>
  );
}

/** Total Jobs, then the five status cards of the mockup in schema order. */
export function StatusCards(): ReactElement {
  return (
    <div className="grid grid-cols-2 gap-space-md sm:grid-cols-3 xl:grid-cols-6">
      <TotalCard />
      {CARD_STATUSES.map((status) => (
        <StatusCard key={status} status={status} />
      ))}
    </div>
  );
}

function share(count: number, total: number): string {
  return total === 0 ? '0%' : `${((count / total) * 100).toFixed(1)}%`;
}

function Segment({ status, total }: { status: JobStatus; total: number }): ReactElement | null {
  const count = useStatusTotal(status);
  if (count == null || count === 0 || total === 0) return null;
  return (
    <div
      className={`h-full ${STATUS_FILL[status]}`}
      style={{ width: `${(count / total) * 100}%` }}
      title={`${JOB_STATUS_LABEL[status]}: ${COUNT.format(count)}`}
    />
  );
}

function LegendItem({ status, total }: { status: JobStatus; total: number }): ReactElement {
  const count = useStatusTotal(status);
  return (
    <li className="flex items-center gap-1.5">
      <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-sm ${STATUS_FILL[status]}`} />
      <span className="text-fg-muted">{JOB_STATUS_LABEL[status]}:</span>
      <span className="font-body-code-bold text-fg">
        {count == null ? '-' : `${COUNT.format(count)} (${share(count, total)})`}
      </span>
    </li>
  );
}

/** The mockup's pipeline density bar: each status as a share of every job, from the same
 * per-status totals as the cards. The bar is decoration; the legend carries the figures. */
export function StatusPipeline(): ReactElement {
  const total = useStatusTotal(null);
  return (
    <div className="flex flex-col gap-space-sm rounded-sm border border-border bg-surface p-space-md">
      <div className="flex items-center justify-between gap-space-sm">
        <span className="font-label-caps text-label-caps uppercase tracking-wider text-fg-faint">
          Job pipeline
        </span>
        <span className="font-body-code text-caption text-fg-faint">
          {total == null ? '' : `${COUNT.format(total)} jobs in all`}
        </span>
      </div>
      <div
        aria-hidden="true"
        className="flex h-3 w-full overflow-hidden rounded-sm border border-border bg-surface-2"
      >
        {total != null &&
          JOB_STATUSES.map((status) => <Segment key={status} status={status} total={total} />)}
      </div>
      <ul className="flex flex-wrap items-center gap-x-space-md gap-y-1 pt-1 font-caption text-caption">
        {JOB_STATUSES.map((status) => (
          <LegendItem key={status} status={status} total={total ?? 0} />
        ))}
      </ul>
    </div>
  );
}
