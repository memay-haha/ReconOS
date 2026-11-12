'use client';

import Link from 'next/link';
import type { ReactElement } from 'react';

import { formatMoment } from '@/lib/format-moment';
import { type Job, JOB_STATUS_LABEL, type JobStatus, useCreateJob } from '@/lib/jobs';
import { type Screenshot, screenshotImageUrl } from '@/lib/screenshots';
import { httpHref } from '@/lib/url-detail';

import { STATUS_DOT, STATUS_TONE, statusClass, statusText } from './http-status';

const CHIP =
  'flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-body-code text-caption font-semibold shadow-sm';
const LABEL_CHIP =
  'flex min-w-0 items-center gap-1 rounded-sm border border-border bg-surface px-1.5 py-0.5 font-body-code text-caption shadow-sm';
const TECH_CHIP =
  'rounded-sm border border-border bg-surface-2 px-1.5 py-0.5 font-body-code text-[11px] text-fg-muted';
const FOOT = 'flex items-center justify-between gap-1 border-t border-border pt-2';
const TIME = 'whitespace-nowrap font-body-code text-caption text-fg-muted';

/** Technologies shown on a card; the rest stay on S07. */
const CARD_TECH = 3;

/** Statuses of a retry job that is still on its way (N18). */
const PENDING: ReadonlySet<JobStatus> = new Set([
  'pending_approval',
  'queued',
  'dispatched',
  'running',
]);

function retryText(status: JobStatus | null): string {
  if (status === null) return 'Not retried';
  if (PENDING.has(status)) return 'Retry pending';
  if (status === 'completed') return 'Retried';
  return `Retry ${JOB_STATUS_LABEL[status].toLowerCase()}`;
}

function detailHref(id: string, position: number): string {
  return `/screenshots/${encodeURIComponent(id)}?at=${String(position)}`;
}

/** The chip at the top left of a card: Traceback for a 5xx (M17), the look-alike group
 * (M15), the first technology category (M16), or Unique. */
function TopLeftChip({ shot }: { shot: Screenshot }): ReactElement {
  if (shot.status_code !== null && shot.status_code >= 500) {
    return (
      <span className={`${LABEL_CHIP} text-crit`}>
        <span aria-hidden="true" className="material-symbols-outlined text-[12px]">
          bug_report
        </span>
        <span>Traceback</span>
      </span>
    );
  }
  if (shot.similar_count > 1 && shot.similar_group !== null) {
    return (
      <span className={`${LABEL_CHIP} text-primary`}>
        <span aria-hidden="true" className="material-symbols-outlined text-[12px]">
          auto_awesome_motion
        </span>
        <span>
          Group #{String(shot.similar_group).padStart(2, '0')} ({shot.similar_count})
        </span>
      </span>
    );
  }
  const category = shot.technologies.find((t) => t.category !== null)?.category ?? null;
  if (category !== null) {
    return (
      <span className={`${LABEL_CHIP} text-fg-muted`}>
        <span aria-hidden="true" className="material-symbols-outlined text-[12px]">
          category
        </span>
        <span className="truncate capitalize">{category}</span>
      </span>
    );
  }
  return (
    <span className={`${LABEL_CHIP} text-primary`}>
      <span aria-hidden="true" className="material-symbols-outlined text-[12px]">
        fingerprint
      </span>
      <span>Unique</span>
    </span>
  );
}

/** One gallery card. Title, URL, technologies and error message come from the target:
 * text only. `position` is the 1-based place in the filtered list, for S07's counter. */
export function ScreenshotCard({
  shot,
  position,
  gowitnessId,
}: {
  shot: Screenshot;
  position: number;
  gowitnessId: string | null;
}): ReactElement {
  const detail = detailHref(shot.id, position);
  const live = httpHref(shot.final_url);
  const url = shot.final_url ?? 'No final URL';
  const dispatch = useCreateJob();

  if (shot.is_failed) {
    const pending = shot.retry_job_status !== null && PENDING.has(shot.retry_job_status);
    const canDispatch =
      shot.final_url !== null && gowitnessId !== null && !pending && !dispatch.isPending;
    return (
      <article
        data-failed
        className="group flex flex-col overflow-hidden rounded-sm border border-crit-bd bg-surface transition-colors hover:border-crit"
      >
        <div className="relative flex aspect-[2/1] w-full flex-col items-center justify-center overflow-hidden border-b border-border bg-crit-soft p-3 text-center">
          <span className="mb-1 flex h-9 w-9 items-center justify-center rounded-full border border-crit-bd bg-crit/20 text-crit">
            <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
              sync_problem
            </span>
          </span>
          <p className="max-w-full truncate rounded-sm border border-crit-bd bg-surface px-2 py-0.5 font-body-code text-[11px] font-medium leading-tight text-crit">
            {shot.error_message ?? 'The screenshot failed with no error message.'}
          </p>
          <div className="pointer-events-none absolute inset-x-2 top-2 flex items-center justify-between">
            <span className="whitespace-nowrap rounded-sm bg-surface px-1 font-body-code text-caption text-fg-muted">
              Screenshot error
            </span>
            <span className={`${CHIP} border-crit-bd bg-crit-soft uppercase text-crit`}>
              <span aria-hidden="true" className="material-symbols-outlined text-[12px]">
                error
              </span>
              <span>Failed</span>
            </span>
          </div>
        </div>
        <div className="flex flex-1 flex-col justify-between gap-2.5 p-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="truncate text-panel-title leading-tight text-crit">
              <Link href={detail} className="hover:underline">
                {shot.title ?? 'Screenshot failed'}
              </Link>
            </h2>
            <div className="flex min-w-0 items-center gap-1">
              <span
                aria-hidden="true"
                className="material-symbols-outlined shrink-0 text-[13px] text-crit"
              >
                link_off
              </span>
              <span className="truncate font-body-code text-caption text-fg-muted" title={url}>
                {url}
              </span>
            </div>
          </div>
          <div className={FOOT}>
            <span className={TIME}>{retryText(shot.retry_job_status)}</span>
            <button
              type="button"
              disabled={!canDispatch}
              onClick={() =>
                shot.final_url !== null &&
                gowitnessId !== null &&
                dispatch.mutate({
                  program_id: shot.program_id,
                  tool_module_id: gowitnessId,
                  target: [shot.final_url],
                })
              }
              className="whitespace-nowrap rounded-sm border border-crit-bd bg-crit-soft px-2 py-0.5 font-body-code text-caption font-medium text-crit transition-colors hover:bg-crit/20 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {dispatch.isSuccess ? 'Dispatched' : 'Force Dispatch'}
            </button>
          </div>
          {dispatch.isError && (
            <p role="alert" className="font-body-code text-caption text-crit">
              Could not create the gowitness job.
            </p>
          )}
        </div>
      </article>
    );
  }

  const tone = statusClass(shot.status_code);
  return (
    <article className="group flex flex-col overflow-hidden rounded-sm border border-border bg-surface transition-colors hover:border-border-strong hover:bg-surface-2">
      <div className="relative aspect-[2/1] w-full overflow-hidden border-b border-border bg-surface-3">
        {/* The image is streamed by Backend API; next/image would proxy it through Next. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={screenshotImageUrl(shot.id)}
          alt={`Screenshot of ${url}`}
          loading="lazy"
          className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
        />
        <div className="pointer-events-none absolute inset-x-2 top-2 flex items-center justify-between gap-1">
          <TopLeftChip shot={shot} />
          <span className={`${CHIP} ${STATUS_TONE[tone]}`}>
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[tone]}`} />
            <span className="whitespace-nowrap">{statusText(shot.status_code)}</span>
          </span>
        </div>
        {live !== null && (
          // Shown on hover like the mockup, and on keyboard focus so the link is never invisible.
          <div className="absolute bottom-2 right-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            <a
              href={live}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${url} in a new tab`}
              className="flex rounded-sm border border-border-strong bg-surface p-1 text-fg shadow hover:bg-surface-3"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
                open_in_new
              </span>
            </a>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col justify-between gap-2.5 p-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="truncate text-panel-title leading-tight text-fg group-hover:text-primary">
            <Link href={detail} className="hover:underline">
              {shot.title ?? 'Untitled page'}
            </Link>
          </h2>
          <div className="flex min-w-0 items-center gap-1">
            <span
              aria-hidden="true"
              className="material-symbols-outlined shrink-0 text-[13px] text-asset-url"
            >
              link
            </span>
            <span className="truncate font-body-code text-caption text-fg-muted" title={url}>
              {url}
            </span>
          </div>
        </div>
        <div className={FOOT}>
          <span className={TIME}>{formatMoment(shot.captured_at)}</span>
          <div className="flex min-w-0 items-center gap-1 overflow-hidden">
            {shot.technologies.slice(0, CARD_TECH).map((t) => (
              <span key={t.name} className={`truncate ${TECH_CHIP}`}>
                {t.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

/** A gowitness job that has not produced its screenshots yet (N16). */
export function QueuedCard({ job }: { job: Job }): ReactElement {
  const first = job.target[0] ?? 'No target';
  const more = job.target.length - 1;
  const label = JOB_STATUS_LABEL[job.status];
  return (
    <article
      data-queued
      className="group flex flex-col overflow-hidden rounded-sm border border-border bg-surface transition-colors hover:border-border-strong"
    >
      <div className="relative flex aspect-[2/1] w-full flex-col items-center justify-center overflow-hidden border-b border-border bg-surface-2 p-3 text-center">
        <span className="mb-1 flex h-9 w-9 items-center justify-center rounded-sm border border-border-strong bg-surface-3 text-fg-muted">
          <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
            hourglass_empty
          </span>
        </span>
        <span className="max-w-[220px] truncate font-body-code text-caption text-fg-muted">
          Job {job.id.slice(0, 8)}
        </span>
        <span className="mt-0.5 text-[10px] uppercase tracking-wider text-fg-muted">
          {job.target.length} {job.target.length === 1 ? 'target' : 'targets'}
        </span>
        <div className="pointer-events-none absolute inset-x-2 top-2 flex items-center justify-between">
          <span className="whitespace-nowrap font-body-code text-caption text-fg-muted">
            gowitness
          </span>
          <span
            className={`${CHIP} border-border-strong bg-surface-3 uppercase text-fg-muted shadow-none`}
          >
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 animate-pulse rounded-full bg-fg-muted"
            />
            <span>{label}</span>
          </span>
        </div>
      </div>
      <div className="flex flex-1 flex-col justify-between gap-2.5 p-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="truncate text-panel-title leading-tight text-fg">
            Screenshot job {label.toLowerCase()}
          </h2>
          <div className="flex min-w-0 items-center gap-1">
            <span
              aria-hidden="true"
              className="material-symbols-outlined shrink-0 text-[13px] text-asset-url"
            >
              link
            </span>
            <span className="truncate font-body-code text-caption text-fg-muted" title={first}>
              {first}
              {more > 0 && ` +${String(more)} more`}
            </span>
          </div>
        </div>
        <div className={FOOT}>
          <span className={TIME}>{label}</span>
          <span className={`whitespace-nowrap ${TECH_CHIP}`}>{formatMoment(job.created_at)}</span>
        </div>
      </div>
    </article>
  );
}
