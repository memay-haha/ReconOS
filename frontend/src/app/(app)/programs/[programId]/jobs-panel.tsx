'use client';

import type { ReactElement } from 'react';

import { Pagination, useCursorStack } from '@/components/pagination';
import { formatMoment } from '@/lib/format-moment';
import { useJobs } from '@/lib/jobs';
import type { ToolModule } from '@/lib/tool-modules';

import { errorText } from '../error-text';
import { creatorLabel, shortId } from '../links';
import { JobStatusBadge } from '../status-badge';
import { ALERT, NOTE, PANEL, TD, TH } from '../ui';

/** The jobs tab: `GET /jobs?program_id=`, newest first. */
export function JobsPanel({
  programId,
  meId,
  toolModules,
}: {
  programId: string;
  meId: string | null;
  toolModules: readonly ToolModule[];
}): ReactElement {
  const { cursor, canGoBack, goNext, goBack } = useCursorStack();
  const jobs = useJobs({ programId, sort: '-created_at' }, cursor);
  const moduleName = new Map(toolModules.map((m) => [m.id, m.name]));

  return (
    <div className={`${PANEL} flex flex-col gap-space-md p-space-md`}>
      <h2 className="font-panel-title text-panel-title text-fg">Job history</h2>
      {jobs.isPending && <p className={NOTE}>Loading jobs…</p>}
      {jobs.isError && (
        <p role="alert" className={ALERT}>
          {errorText(jobs.error, 'Could not load the jobs of this program.')}
        </p>
      )}
      {jobs.data !== undefined && jobs.data.items.length === 0 && (
        <p className={NOTE}>No jobs for this program yet.</p>
      )}
      {jobs.data !== undefined && jobs.data.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead className="border-b border-border bg-surface-2">
              <tr>
                <th className={TH}>Job ID</th>
                <th className={TH}>Target</th>
                <th className={TH}>Tool module</th>
                <th className={TH}>Created by</th>
                <th className={TH}>Status</th>
                <th className={TH}>Finished</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {jobs.data.items.map((job) => (
                <tr key={job.id}>
                  <td className={`${TD} font-body-code`} title={job.id}>
                    {shortId(job.id)}
                  </td>
                  <td className={`${TD} break-all font-body-code`}>{job.target.join(', ')}</td>
                  <td className={TD}>
                    {moduleName.get(job.tool_module_id) ?? shortId(job.tool_module_id)}
                  </td>
                  <td className={TD}>{creatorLabel(job.created_by, meId)}</td>
                  <td className={TD}>
                    <JobStatusBadge status={job.status} />
                  </td>
                  <td className={TD}>
                    {job.finished_at === null ? '-' : formatMoment(job.finished_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {jobs.data !== undefined && (
        <Pagination
          label="Program job pagination"
          page={{
            total: jobs.data.total,
            totalIsEstimate: jobs.data.total_is_estimate,
            nextCursor: jobs.data.next_cursor,
          }}
          canGoBack={canGoBack}
          onBack={goBack}
          onNext={() => goNext(jobs.data.next_cursor)}
        />
      )}
    </div>
  );
}
