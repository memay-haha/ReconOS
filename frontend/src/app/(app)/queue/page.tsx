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
import { JobStatusBadge } from '../programs/status-badge';
import { ALERT, FIELD, NOTE, PANEL, TD, TH } from '../programs/ui';
import { DispatcherPanel, DistributionPanel } from './dispatcher-panel';
import { JobActions } from './job-actions';
import { JobDetail } from './job-detail';
import { StatusCards } from './status-cards';

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
    <div className="flex w-full flex-col gap-space-lg">
      <div className="flex flex-col gap-space-xs pt-space-xs">
        <h1 className="text-headline-lg text-fg">Queue</h1>
        <p className="max-w-2xl text-body-default text-fg-muted">
          Jobs by status, the dispatcher that hands them to workers, and what is waiting.
        </p>
      </div>

      <StatusCards />

      <div className="grid grid-cols-1 gap-space-md lg:grid-cols-2">
        {/* Workers is Superadmin and Admin only; User sees the dispatcher alone. */}
        <DispatcherPanel showWorkers={role === 'superadmin' || role === 'admin'} />
        <DistributionPanel toolModuleNames={toolModuleNames} programNames={programNames} />
      </div>

      <div className={`${PANEL} flex flex-col`}>
        <div className="flex flex-col gap-space-md border-b border-border p-space-md md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-space-sm">
            <span aria-hidden="true" className="material-symbols-outlined text-icon text-fg-muted">
              stream
            </span>
            <h3 className="font-panel-title text-panel-title text-fg">Jobs</h3>
          </div>
          <div className="flex flex-col gap-space-sm sm:flex-row">
            <label htmlFor="queue-status" className="sr-only">
              Status
            </label>
            <select
              id="queue-status"
              value={status ?? ''}
              onChange={(e) => {
                setStatus(e.target.value === '' ? null : (e.target.value as JobStatus));
                reset();
              }}
              className={`${FIELD} h-9 sm:w-48`}
            >
              <option value="">Status: All statuses</option>
              {JOB_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {JOB_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <label htmlFor="queue-program" className="sr-only">
              Program
            </label>
            <select
              id="queue-program"
              value={programId ?? ''}
              onChange={(e) => {
                setProgramId(e.target.value === '' ? null : e.target.value);
                reset();
              }}
              className={`${FIELD} h-9 sm:w-48`}
            >
              <option value="">Program: All programs</option>
              {(programs.data?.items ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
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
            <table className="w-full min-w-[880px] border-collapse">
              <thead className="border-b border-border bg-surface-2">
                <tr>
                  <th className={TH}>Job ID</th>
                  <th className={TH}>Program</th>
                  <th className={TH}>Target</th>
                  <th className={TH}>Tool module</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>Created</th>
                  <th className={TH}>Duration</th>
                  <th className={TH}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {jobs.data.items.map((job) => (
                  <tr key={job.id}>
                    <td className={`${TD} font-body-code`} title={job.id}>
                      {shortId(job.id)}
                    </td>
                    <td className={TD}>
                      {programNames.get(job.program_id) ?? shortId(job.program_id)}
                    </td>
                    <td className={`${TD} break-all font-body-code`}>{job.target.join(', ')}</td>
                    <td className={TD}>
                      {toolModuleNames.get(job.tool_module_id) ?? shortId(job.tool_module_id)}
                    </td>
                    <td className={TD}>
                      <JobStatusBadge status={job.status} />
                      {job.status_reason !== null && (
                        <span className="mt-space-xs block text-caption text-fg-muted">
                          {job.status_reason}
                        </span>
                      )}
                    </td>
                    <td className={TD}>{formatMoment(job.created_at)}</td>
                    <td className={`${TD} font-body-code`}>
                      {durationOf(job.started_at, job.finished_at)}
                    </td>
                    <td className={TD}>
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
