'use client';

import { type ReactElement, useState } from 'react';

import { Pagination, useCursorStack } from '@/components/pagination';
import { useMe } from '@/lib/auth';
import { formatMoment } from '@/lib/format-moment';
import { JOB_STATUS_LABEL, JOB_STATUSES, type JobStatus, useJobs } from '@/lib/jobs';
import { usePrograms } from '@/lib/programs';
import { useToolModules } from '@/lib/tool-modules';

import { errorText } from '../programs/error-text';
import { durationOf, shortId } from '../programs/links';
import { ALERT, NOTE, PANEL } from '../programs/ui';
import { DispatcherPanel, DistributionPanel } from './dispatcher-panel';
import { JobActions } from './job-actions';
import { JobDetail } from './job-detail';
import { StatusCards, StatusPipeline } from './status-cards';
import { STATUS_CHIP, STATUS_FILL } from './status-tone';

// Table and filter density follow the mockup (M7): caption-size cells, mono figures, h-8 selects.
const TH =
  'px-space-md py-2 text-left font-label-caps text-label-caps font-medium uppercase tracking-wider text-fg-muted';
const TH_END =
  'px-space-md py-2 text-right font-label-caps text-label-caps font-medium uppercase tracking-wider text-fg-muted';
const TD = 'px-space-md py-2.5 align-top';
const SELECT =
  'h-8 w-full appearance-none rounded-sm border border-border-strong bg-surface-2 pl-2 pr-7 font-body-default text-caption text-fg focus:border-primary-container focus:outline-none focus:ring-1 focus:ring-primary-container sm:w-auto';
const CHEVRON =
  'material-symbols-outlined pointer-events-none absolute right-1.5 top-2 text-[16px] text-fg-faint';

/** S10: the job queue, the dispatcher and the workers. */
export default function QueuePage(): ReactElement {
  const me = useMe();
  const role = me.data?.role ?? null;
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [programId, setProgramId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ jobId: string; view: 'raw' | 'logs' } | null>(null);
  const { cursor, canGoBack, goNext, goBack, reset } = useCursorStack();
  const jobs = useJobs({ status, programId, sort: '-created_at' }, cursor);
  const programs = usePrograms({ limit: 200, sort: 'name' });
  const toolModules = useToolModules();
  const programNames = new Map((programs.data?.items ?? []).map((p) => [p.id, p.name]));
  const toolModuleNames = new Map((toolModules.data?.items ?? []).map((m) => [m.id, m.name]));

  return (
    <div className="flex w-full flex-col gap-space-md">
      <div className={`${PANEL} flex flex-col gap-0.5 p-space-lg`}>
        <h1 className="font-headline-lg text-headline-lg tracking-tight text-fg">Queue</h1>
        <p className="text-body-default text-fg-muted">
          Jobs by status, the dispatcher that hands them to workers, and what is waiting.
        </p>
      </div>

      <StatusCards />
      <StatusPipeline />

      <div className="grid grid-cols-1 gap-space-md lg:grid-cols-2">
        {/* Workers is Superadmin and Admin only; User sees the dispatcher alone. */}
        <DispatcherPanel showWorkers={role === 'superadmin' || role === 'admin'} />
        <DistributionPanel toolModuleNames={toolModuleNames} programNames={programNames} />
      </div>

      <div className={`${PANEL} flex flex-col`}>
        <div className="flex flex-col gap-space-md border-b border-border p-space-md md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-space-sm">
            <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-primary">
              stream
            </span>
            <h3 className="font-panel-title text-panel-title font-semibold text-fg">Jobs</h3>
          </div>
          <div className="flex flex-col gap-space-xs sm:flex-row">
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
            <label htmlFor="queue-program" className="sr-only">
              Program
            </label>
            <span className="relative">
              <select
                id="queue-program"
                value={programId ?? ''}
                onChange={(e) => {
                  setProgramId(e.target.value === '' ? null : e.target.value);
                  reset();
                }}
                className={SELECT}
              >
                <option value="">Program: All programs</option>
                {(programs.data?.items ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <span aria-hidden="true" className={CHEVRON}>
                expand_more
              </span>
            </span>
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
            <table className="w-full min-w-[880px] border-collapse text-left">
              <thead className="h-8 border-b border-border bg-surface-2">
                <tr>
                  <th className={TH}>Job ID</th>
                  <th className={TH}>Program</th>
                  <th className={TH}>Target</th>
                  <th className={TH}>Tool module</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>Created</th>
                  <th className={TH}>Duration</th>
                  <th className={TH_END}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {jobs.data.items.map((job) => (
                  <tr
                    key={job.id}
                    className={`transition-colors hover:bg-surface-3 ${job.status === 'failed' ? 'bg-crit-soft/20' : ''}`}
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
                    <td className={`${TD} break-all font-body-code text-body-code text-fg`}>
                      {job.target.join(', ')}
                    </td>
                    <td className={`${TD} font-caption text-body-default font-medium text-primary`}>
                      {toolModuleNames.get(job.tool_module_id) ?? shortId(job.tool_module_id)}
                    </td>
                    <td className={TD}>
                      <span
                        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border px-2 py-0.5 font-caption text-caption ${STATUS_CHIP[job.status]}`}
                      >
                        <span
                          aria-hidden="true"
                          className={`h-1.5 w-1.5 rounded-full ${STATUS_FILL[job.status]}`}
                        />
                        {JOB_STATUS_LABEL[job.status]}
                      </span>
                      {job.status_reason !== null && (
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
                    <td className={`${TD} text-right`}>
                      <JobActions
                        job={job}
                        me={me.data ?? null}
                        onShow={(view) => setDetail({ jobId: job.id, view })}
                      />
                    </td>
                  </tr>
                ))}
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
    </div>
  );
}
