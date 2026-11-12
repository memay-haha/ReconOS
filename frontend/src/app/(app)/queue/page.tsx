'use client';

import { type ReactElement, Suspense, useState } from 'react';

import { Pagination, useCursorStack } from '@/components/pagination';
import { useMe } from '@/lib/auth';
import { versionLabel } from '@/lib/build-info';
import { useDispatcherStatus, useWakeDispatcher } from '@/lib/dispatcher';
import { formatMoment } from '@/lib/format-moment';
import {
  type Job,
  JOB_STATUS_LABEL,
  JOB_STATUSES,
  jobPriorityOf,
  type JobStatus,
  useBulkRetryJobs,
  useCleanupJobs,
  useJobs,
} from '@/lib/jobs';
import { usePrograms } from '@/lib/programs';
import { useToolModules } from '@/lib/tool-modules';
import { useQueryParam } from '@/lib/url-params';

import { paramsSummary } from '../programs/[programId]/overview-panel';
import { Dialog } from '../programs/dialog';
import { errorText } from '../programs/error-text';
import { durationOf, shortId } from '../programs/links';
import { ALERT, COUNT, NOTE, PANEL } from '../programs/ui';
import { DispatcherPanel, DistributionPanel } from './dispatcher-panel';
import { JobActions } from './job-actions';
import { JobDetail } from './job-detail';
import { StatusCards, StatusPipeline } from './status-cards';
import { STATUS_CHIP, STATUS_FILL } from './status-tone';
import { useSettled } from '../programs/use-settled';

// Table and filter density follow the mockup (M7): caption-size cells, mono figures, h-8 selects.
const TH =
  'px-3 py-2 text-left font-label-caps text-label-caps font-medium uppercase tracking-wider text-fg-muted';
const TH_END =
  'px-3 py-2 text-right font-label-caps text-label-caps font-medium uppercase tracking-wider text-fg-muted';
const TD = 'px-3 py-2.5 align-top';
const SELECT =
  'h-8 w-full appearance-none rounded-sm border border-border-strong bg-surface-2 pl-2 pr-7 font-body-default text-caption text-fg focus:border-primary-container focus:outline-none focus:ring-1 focus:ring-primary-container sm:w-auto';
const CHEVRON =
  'material-symbols-outlined pointer-events-none absolute right-1.5 top-2 text-[16px] text-fg-faint';
const SEARCH =
  'h-8 w-full rounded-sm border border-border-strong bg-surface-2 pl-7 pr-2 font-body-code text-caption text-fg placeholder:text-fg-faint focus:border-primary-container focus:outline-none focus:ring-1 focus:ring-primary-container sm:w-64';
const TOOL_BUTTON =
  'inline-flex h-9 items-center gap-1.5 rounded-sm border border-border-strong bg-surface-2 px-3 text-body-default text-fg transition-colors hover:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60';
const DISPATCH_BUTTON =
  'inline-flex h-9 items-center gap-1.5 rounded-sm bg-primary-container px-4 text-body-default font-semibold text-accent-ink shadow-sm transition-colors hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60';
const TOGGLE =
  'inline-flex h-8 items-center gap-1.5 rounded-sm border border-border-strong bg-surface-2 px-2.5 text-caption text-fg transition-colors hover:bg-surface-3 aria-pressed:border-warn-bd aria-pressed:text-warn focus:outline-none focus:ring-2 focus:ring-ring';

/** How often the job list and the dispatcher re-read while auto-refresh runs. */
const REFRESH_MS = 10_000;

/** Rows a page, as the mockup's table. */
const limit = 25;

/** bulk-retry takes at most 500 ids: docs/api/architecture.md. */
const RETRY_MAX = 500;

/** S10: the job queue, the dispatcher and the workers. `?job=<id>` opens that job's logs and
 * marks its row: S20, alerts and search link here. useSearchParams needs Suspense. */
export default function QueuePage(): ReactElement {
  return (
    <Suspense>
      <QueueScreen />
    </Suspense>
  );
}

function QueueScreen(): ReactElement {
  const linkedJob = useQueryParam('job');
  const me = useMe();
  const role = me.data?.role ?? null;
  const manager = role === 'superadmin' || role === 'admin';
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [toolModuleId, setToolModuleId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [paused, setPaused] = useState(false);
  const [detail, setDetail] = useState<{ jobId: string; view: 'raw' | 'logs' } | null>(
    linkedJob === null ? null : { jobId: linkedJob, view: 'logs' },
  );
  const [errorOf, setErrorOf] = useState<Job | null>(null);
  const q = useSettled(search.trim());
  const poll = paused ? false : REFRESH_MS;
  const { cursor, canGoBack, depth, goNext, goBack, reset } = useCursorStack();
  const jobs = useJobs({ status, toolModuleId, q, sort: '-created_at', limit }, cursor, {
    refetchInterval: poll,
  });
  const failed = useJobs({ status: 'failed', limit: RETRY_MAX });
  const dispatcher = useDispatcherStatus(poll);
  const programs = usePrograms({ limit: 200, sort: 'name' });
  const toolModules = useToolModules();
  const wake = useWakeDispatcher();
  const cleanup = useCleanupJobs();
  const retry = useBulkRetryJobs();
  const programNames = new Map((programs.data?.items ?? []).map((p) => [p.id, p.name]));
  const toolModuleNames = new Map((toolModules.data?.items ?? []).map((m) => [m.id, m.name]));
  // User may retry only jobs they created; hiding the others is for convenience only.
  const retryIds = (failed.data?.items ?? [])
    .filter((j) => manager || j.created_by === me.data?.id)
    .map((j) => j.id);
  const queuedTotal = dispatcher.data?.queued_total;
  const health = dispatcher.data?.status ?? null;
  const version = versionLabel();
  const actionError = wake.error ?? cleanup.error ?? retry.error;

  return (
    <div className="flex w-full flex-col gap-space-md">
      <div
        className={`${PANEL} flex flex-col justify-between gap-space-md p-space-lg lg:flex-row lg:items-start`}
      >
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-space-sm">
            {/* N32: the glossary calls it Queue, not Staging Queue. */}
            <h1 className="font-headline-lg text-headline-lg tracking-tight text-fg">Queue</h1>
            {health !== null && (
              <span className="rounded-sm border border-accent-soft-bd bg-accent-soft px-1.5 py-0.5 font-body-code text-caption uppercase text-primary">
                Dispatcher: {health}
              </span>
            )}
            {version !== null && (
              <span className="inline-flex items-center gap-1 rounded-sm border border-good-bd bg-good-soft px-1.5 py-0.5 font-body-code text-caption text-good">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-good" />
                ReconOS {version}
              </span>
            )}
          </div>
          <p className="max-w-xl text-body-default text-fg-muted">
            Jobs by status, the dispatcher that hands them to workers, and what is waiting.
          </p>
        </div>
        <div className="flex flex-col items-start gap-space-sm lg:items-end">
          <div className="flex flex-wrap gap-space-sm">
            <button
              type="button"
              disabled={retryIds.length === 0 || retry.isPending}
              onClick={() => retry.mutate(retryIds)}
              className={TOOL_BUTTON}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                replay
              </span>
              Retry Failed
              <span className="font-body-code text-crit">({COUNT.format(retryIds.length)})</span>
            </button>
            {manager && (
              <button
                type="button"
                disabled={cleanup.isPending}
                onClick={() => cleanup.mutate()}
                title="Cancel queued jobs of paused or archived programs"
                className={TOOL_BUTTON}
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                  cleaning_services
                </span>
                Cleanup
              </button>
            )}
          </div>
          {manager && (
            <button
              type="button"
              disabled={wake.isPending}
              onClick={() => wake.mutate()}
              className={DISPATCH_BUTTON}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                bolt
              </span>
              Dispatch All
              {queuedTotal !== undefined && ` (${COUNT.format(queuedTotal)} Queued)`}
            </button>
          )}
          {cleanup.isSuccess && (
            <p role="status" className="text-caption text-good">
              Cleanup cancelled {COUNT.format(cleanup.data?.cancelled ?? 0)} queued jobs.
            </p>
          )}
          {actionError !== null && (
            <p role="alert" className="text-caption text-crit-strong">
              {errorText(actionError, 'Could not change the queue.')}
            </p>
          )}
        </div>
      </div>

      <StatusCards />
      <StatusPipeline />

      <div className="grid grid-cols-1 gap-space-md lg:grid-cols-2">
        {/* Workers is Superadmin and Admin only; User sees the dispatcher alone. */}
        <DispatcherPanel
          showWorkers={manager}
          version={version}
          toolModuleNames={toolModuleNames}
          poll={poll}
        />
        <DistributionPanel
          toolModuleNames={toolModuleNames}
          programNames={programNames}
          poll={poll}
        />
      </div>

      <div className={`${PANEL} flex flex-col`}>
        <div className="flex flex-col gap-space-md border-b border-border p-space-md xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-space-sm">
            <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-primary">
              stream
            </span>
            <h3 className="font-panel-title text-panel-title font-semibold text-fg">Jobs</h3>
            <span className="font-caption text-caption text-fg-faint">
              {paused ? 'Auto-refresh paused' : 'Auto-refresh every 10s'}
            </span>
          </div>
          <div className="flex flex-col gap-space-xs sm:flex-row sm:flex-wrap sm:items-center">
            <span className="relative">
              <span
                aria-hidden="true"
                className="material-symbols-outlined pointer-events-none absolute left-1.5 top-1.5 text-[16px] text-fg-faint"
              >
                search
              </span>
              <label htmlFor="queue-search" className="sr-only">
                Filter jobs
              </label>
              <input
                id="queue-search"
                type="search"
                value={search}
                placeholder="Filter jobs by target or tool module"
                onChange={(e) => {
                  setSearch(e.target.value);
                  reset();
                }}
                className={SEARCH}
              />
            </span>
            <label htmlFor="queue-status" className="sr-only">
              Status
            </label>
            <span className="relative">
              <select
                id="queue-status"
                value={status ?? ''}
                onChange={(e) => {
                  setStatus(e.target.value === '' ? null : (e.target.value as JobStatus));
                  reset();
                }}
                className={SELECT}
              >
                <option value="">Status: All statuses</option>
                {JOB_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {JOB_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
              <span aria-hidden="true" className={CHEVRON}>
                expand_more
              </span>
            </span>
            <label htmlFor="queue-tool-module" className="sr-only">
              Tool module
            </label>
            <span className="relative">
              <select
                id="queue-tool-module"
                value={toolModuleId ?? ''}
                onChange={(e) => {
                  setToolModuleId(e.target.value === '' ? null : e.target.value);
                  reset();
                }}
                className={SELECT}
              >
                <option value="">Tool module: All</option>
                {(toolModules.data?.items ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <span aria-hidden="true" className={CHEVRON}>
                expand_more
              </span>
            </span>
            <button
              type="button"
              aria-pressed={paused}
              onClick={() => setPaused(!paused)}
              className={TOGGLE}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                {paused ? 'play_arrow' : 'pause'}
              </span>
              {paused ? 'Resume auto-refresh' : 'Pause auto-refresh'}
            </button>
          </div>
        </div>
        {jobs.isPending && <p className={NOTE}>Loading jobs…</p>}
        {jobs.isError && (
          <p role="alert" className={ALERT}>
            {errorText(jobs.error, 'Could not load the job list.')}
          </p>
        )}
        {jobs.data !== undefined && jobs.data.items.length === 0 && (
          <p className={NOTE}>No jobs match this filter.</p>
        )}
        {jobs.data !== undefined && jobs.data.items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left">
              <thead className="h-8 border-b border-border bg-surface-2">
                <tr>
                  <th className={TH}>Job ID</th>
                  <th className={TH}>Program</th>
                  <th className={TH}>Target</th>
                  <th className={TH}>Tool module</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>Created</th>
                  <th className={TH}>Duration</th>
                  <th className={TH}>Worker</th>
                  <th className={TH_END}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {jobs.data.items.map((job) => {
                  const params = paramsSummary(job.params);
                  const priority = jobPriorityOf(job);
                  return (
                    <tr
                      key={job.id}
                      aria-current={job.id === linkedJob ? 'true' : undefined}
                      className={`transition-colors hover:bg-surface-3 ${job.status === 'failed' ? 'bg-crit-soft/20' : ''} ${job.id === linkedJob ? 'outline outline-1 -outline-offset-1 outline-primary-container' : ''}`}
                    >
                      <td
                        className={`${TD} font-body-code-bold text-body-code-bold ${job.status === 'failed' ? 'text-crit' : 'text-fg'}`}
                        title={job.id}
                      >
                        {shortId(job.id)}
                      </td>
                      <td className={TD}>
                        <span className="whitespace-nowrap rounded-sm border border-border bg-surface-2 px-1.5 py-0.5 font-body-code text-caption text-primary">
                          {programNames.get(job.program_id) ?? shortId(job.program_id)}
                        </span>
                      </td>
                      <td
                        className={`${TD} min-w-[150px] break-all font-body-code text-body-code text-fg`}
                      >
                        {job.target.join(', ')}
                      </td>
                      <td className={TD}>
                        <span className="font-caption text-body-default font-medium text-primary">
                          {job.tool_module_name ??
                            toolModuleNames.get(job.tool_module_id) ??
                            shortId(job.tool_module_id)}
                        </span>
                        {params !== null && (
                          <span className="block font-body-code text-caption text-fg-faint">
                            ({params})
                          </span>
                        )}
                      </td>
                      <td className={TD}>
                        <span className="flex flex-wrap items-center gap-1">
                          <span
                            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border px-2 py-0.5 font-caption text-caption ${STATUS_CHIP[job.status]}`}
                          >
                            <span
                              aria-hidden="true"
                              className={`h-1.5 w-1.5 rounded-full ${STATUS_FILL[job.status]}`}
                            />
                            {JOB_STATUS_LABEL[job.status]}
                          </span>
                          {priority === 'high' && (
                            <span className="rounded-sm bg-warn-soft px-1 font-label-caps text-label-caps uppercase text-warn">
                              High
                            </span>
                          )}
                        </span>
                        {job.status_reason !== null && job.status !== 'failed' && (
                          <span className="mt-space-xs block font-caption text-caption text-fg-faint">
                            {job.status_reason}
                          </span>
                        )}
                      </td>
                      <td
                        className={`${TD} whitespace-nowrap font-body-code text-caption text-fg-muted`}
                      >
                        {formatMoment(job.created_at)}
                      </td>
                      <td
                        className={`${TD} font-body-code text-caption ${job.status === 'failed' ? 'font-medium text-crit' : 'text-fg'}`}
                      >
                        {durationOf(job.started_at, job.finished_at)}
                      </td>
                      <td className={`${TD} break-all font-body-code text-caption text-fg-muted`}>
                        {job.worker_name ?? (job.status === 'queued' ? 'pending' : '-')}
                      </td>
                      <td className={`${TD} w-[200px] text-right`}>
                        <JobActions
                          job={job}
                          me={me.data ?? null}
                          onShow={(view) => setDetail({ jobId: job.id, view })}
                          onError={() => setErrorOf(job)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {jobs.data !== undefined && (
          <div className="border-t border-border bg-surface-2 px-space-md">
            <Pagination
              label="Job list pagination"
              page={{
                total: jobs.data.total,
                totalIsEstimate: jobs.data.total_is_estimate,
                nextCursor: jobs.data.next_cursor,
              }}
              shown={jobs.data.items.length}
              start={depth * limit + 1}
              noun="jobs"
              canGoBack={canGoBack}
              onBack={goBack}
              onNext={() => goNext(jobs.data.next_cursor)}
            />
          </div>
        )}
      </div>

      {detail !== null && (
        <JobDetail jobId={detail.jobId} view={detail.view} onClose={() => setDetail(null)} />
      )}
      {errorOf !== null && (
        <Dialog title={`Job ${shortId(errorOf.id)} failed`} onClose={() => setErrorOf(null)}>
          {/* status_reason is backend text about target output: plain text only. */}
          <p className="whitespace-pre-wrap break-words font-body-code text-body-code text-fg">
            {errorOf.status_reason}
          </p>
        </Dialog>
      )}
    </div>
  );
}
