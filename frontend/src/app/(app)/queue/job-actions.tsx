'use client';

import type { ReactElement } from 'react';

import type { CurrentUser } from '@/lib/auth';
import { type Job, type JobAction, type JobStatus, useJobAction } from '@/lib/jobs';

import { errorText } from '../programs/error-text';
import { DANGER_BUTTON, ROW_BUTTON } from '../programs/ui';

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
    if (action === 'approve' || action === 'reject') return manager;
    return manager || job.created_by === me.id;
  });
}

export function JobActions({
  job,
  me,
  onShow,
}: {
  job: Job;
  me: CurrentUser | null;
  onShow: (view: 'raw' | 'logs') => void;
}): ReactElement {
  const mutation = useJobAction();
  const actions = allowedActions(job, me);
  return (
    <span className="flex flex-col gap-space-xs">
      <span className="flex flex-wrap gap-space-xs">
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ jobId: job.id, action })}
            className={action === 'reject' || action === 'cancel' ? DANGER_BUTTON : ROW_BUTTON}
          >
            {LABEL[action]}
          </button>
        ))}
        <button type="button" onClick={() => onShow('raw')} className={ROW_BUTTON}>
          Raw outputs
        </button>
        <button type="button" onClick={() => onShow('logs')} className={ROW_BUTTON}>
          Logs
        </button>
      </span>
      {mutation.isError && (
        <span role="alert" className="text-caption text-crit-strong">
          {errorText(mutation.error, 'Could not change the job.')}
        </span>
      )}
    </span>
  );
}
