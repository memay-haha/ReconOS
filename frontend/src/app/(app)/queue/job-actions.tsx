'use client';

import type { ReactElement } from 'react';

import type { CurrentUser } from '@/lib/auth';
import {
  type Job,
  type JobAction,
  type JobStatus,
  useJobAction,
  usePrioritizeJob,
} from '@/lib/jobs';

import { errorText } from '../programs/error-text';

// Row buttons as the mockup draws them (M7): caption text on surface-2, the stopping
// actions in the soft critical colour.
const ROW_BUTTON =
  'inline-flex items-center rounded-sm border border-border bg-surface-2 px-2 py-1 font-body-default text-caption text-fg hover:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60';
const DANGER_BUTTON =
  'inline-flex items-center rounded-sm border border-crit-bd bg-crit-soft px-2 py-1 font-body-default text-caption text-crit hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60';
const APPROVE_BUTTON =
  'inline-flex items-center rounded-sm border border-accent-soft-bd bg-accent-soft px-2 py-1 font-body-default text-caption text-primary hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60';

/** Which actions a row offers, from the job lifecycle in docs/architecture/business-flow.md
 * and the matrix in docs/security/authorization.md. Hiding is for convenience only: the
 * backend decides and answers 403 or 409. */
const BY_STATUS: Readonly<Record<JobStatus, readonly JobAction[]>> = {
  pending_approval: ['approve', 'reject'],
  queued: ['cancel'],
  dispatched: ['cancel'],
  running: ['cancel'],
  completed: [],
  failed: ['retry'],
  cancelled: ['retry'],
};

const LABEL: Readonly<Record<JobAction, string>> = {
  approve: 'Approve',
  reject: 'Reject',
  cancel: 'Cancel',
  retry: 'Retry',
};

export function allowedActions(job: Job, me: CurrentUser | null): readonly JobAction[] {
  if (me === null) return [];
  const manager = me.role === 'superadmin' || me.role === 'admin';
  return BY_STATUS[job.status].filter((action) => {
    // A second person reviews an exploit job (G5): never its creator, Superadmin included.
    if (action === 'approve' || action === 'reject') return manager && job.created_by !== me.id;
    return manager || job.created_by === me.id;
  });
}

/** Dispatch Now (D8): a queued job, Superadmin and Admin. */
export function canDispatchNow(job: Job, me: CurrentUser | null): boolean {
  return job.status === 'queued' && (me?.role === 'superadmin' || me?.role === 'admin');
}

export function JobActions({
  job,
  me,
  onShow,
  onError,
}: {
  job: Job;
  me: CurrentUser | null;
  onShow: (view: 'raw' | 'logs') => void;
  /** View Error: opens `status_reason` of a failed job. */
  onError: () => void;
}): ReactElement {
  const mutation = useJobAction();
  const prioritize = usePrioritizeJob();
  const actions = allowedActions(job, me);
  const failed = mutation.isError ? mutation.error : prioritize.isError ? prioritize.error : null;
  return (
    <span className="flex flex-col items-end gap-space-xs">
      <span className="flex flex-wrap justify-end gap-1">
        {canDispatchNow(job, me) && (
          <button
            type="button"
            disabled={prioritize.isPending}
            onClick={() => prioritize.mutate(job.id)}
            className={APPROVE_BUTTON}
          >
            Dispatch Now
          </button>
        )}
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ jobId: job.id, action })}
            className={
              action === 'reject' || action === 'cancel'
                ? DANGER_BUTTON
                : action === 'approve'
                  ? APPROVE_BUTTON
                  : ROW_BUTTON
            }
          >
            {LABEL[action]}
          </button>
        ))}
        {job.status === 'failed' && job.status_reason !== null && (
          <button type="button" onClick={onError} className={DANGER_BUTTON}>
            View Error
          </button>
        )}
        {/* As the mockup: output of a completed job, logs of a running or failed one. */}
        {job.status === 'completed' && (
          <button type="button" onClick={() => onShow('raw')} className={ROW_BUTTON}>
            Raw outputs
          </button>
        )}
        {(job.status === 'running' || job.status === 'failed') && (
          <button type="button" onClick={() => onShow('logs')} className={ROW_BUTTON}>
            Logs
          </button>
        )}
      </span>
      {failed !== null && (
        <span role="alert" className="text-caption text-crit-strong">
          {errorText(failed, 'Could not change the job.')}
        </span>
      )}
    </span>
  );
}
