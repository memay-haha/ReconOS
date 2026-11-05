'use client';

import type { ReactElement } from 'react';

import { JOB_STATUS_LABEL, JOB_STATUSES, type JobStatus, useJobs } from '@/lib/jobs';

import { StatTile, type TileTone, totalOf } from '../programs/stat-tile';

const CARD: Readonly<Record<JobStatus, { icon: string; tone: TileTone }>> = {
  pending_approval: { icon: 'gavel', tone: 'warn' },
  queued: { icon: 'hourglass_top', tone: 'primary' },
  dispatched: { icon: 'outbox', tone: 'info' },
  running: { icon: 'sync', tone: 'primary' },
  completed: { icon: 'check_circle', tone: 'good' },
  failed: { icon: 'error', tone: 'crit' },
  cancelled: { icon: 'block', tone: 'muted' },
};

function StatusCard({ status }: { status: JobStatus }): ReactElement {
  // limit=1: only `total` is read, the same count the sidebar badge uses.
  const count = useJobs({ status, limit: 1 });
  return (
    <StatTile
      label={JOB_STATUS_LABEL[status]}
      icon={CARD[status].icon}
      tone={CARD[status].tone}
      value={totalOf(count)}
    />
  );
}

/** One card per job status, in schema order: docs/data/schema.md. */
export function StatusCards(): ReactElement {
  return (
    <div className="grid grid-cols-2 gap-space-md sm:grid-cols-4 xl:grid-cols-7">
      {JOB_STATUSES.map((status) => (
        <StatusCard key={status} status={status} />
      ))}
    </div>
  );
}
