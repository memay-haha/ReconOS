import type { ReactElement } from 'react';

import { JOB_STATUS_LABEL, type JobStatus } from '@/lib/jobs';
import type { ProgramStatus } from '@/lib/programs';

export const PROGRAM_STATUS_LABEL: Readonly<Record<ProgramStatus, string>> = {
  active: 'Active',
  paused: 'Paused',
  archived: 'Archived',
};

const PROGRAM_TONE: Readonly<Record<ProgramStatus, string>> = {
  active: 'bg-good-soft text-good',
  paused: 'bg-warn-soft text-warn',
  archived: 'bg-surface-3 text-fg-muted',
};

const PROGRAM_DOT: Readonly<Record<ProgramStatus, string>> = {
  active: 'bg-good',
  paused: 'bg-warn',
  archived: 'bg-fg-muted',
};

const JOB_TONE: Readonly<Record<JobStatus, string>> = {
  pending_approval: 'bg-warn-soft text-warn',
  queued: 'bg-surface-3 text-status-queue',
  dispatched: 'bg-info-soft text-info',
  running: 'bg-accent-soft text-primary',
  completed: 'bg-good-soft text-good',
  failed: 'bg-crit-strong-soft text-crit-strong',
  cancelled: 'bg-surface-3 text-fg-muted',
};

const BADGE =
  'inline-flex items-center gap-space-xs rounded-sm px-space-sm py-0.5 font-label-caps text-label-caps uppercase';

export function ProgramStatusBadge({ status }: { status: ProgramStatus }): ReactElement {
  return (
    <span className={`${BADGE} ${PROGRAM_TONE[status]}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${PROGRAM_DOT[status]}`} />
      {PROGRAM_STATUS_LABEL[status]}
    </span>
  );
}

export function JobStatusBadge({ status }: { status: JobStatus }): ReactElement {
  return <span className={`${BADGE} ${JOB_TONE[status]}`}>{JOB_STATUS_LABEL[status]}</span>;
}
