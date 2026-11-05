'use client';

import { useQuery } from '@tanstack/react-query';

import { apiRequest } from './api-client';
import { type Page, withQuery } from './page';

export const LOG_LEVELS = ['info', 'warning', 'error', 'critical'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** A row of `app_log` in `reconos_log`: docs/data/schema.md, section on the log database. */
export interface JobLogEntry {
  readonly id: string;
  readonly logged_at: string;
  readonly level: LogLevel;
  readonly service: string;
  readonly event: string;
  readonly job_id: string | null;
  readonly context: Readonly<Record<string, unknown>>;
}

export const jobLogKeys = {
  all: ['job-logs'] as const,
  list: (jobId: string, cursor: string | null) => ['job-logs', jobId, cursor] as const,
};

export function useJobLogs(jobId: string, cursor: string | null = null) {
  return useQuery({
    queryKey: jobLogKeys.list(jobId, cursor),
    queryFn: () => apiRequest<Page<JobLogEntry>>(withQuery(`/jobs/${jobId}/logs`, { cursor })),
  });
}
