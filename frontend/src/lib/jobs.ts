'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from './api-client';

export const JOB_STATUSES = [
  'pending_approval',
  'queued',
  'dispatched',
  'running',
  'completed',
  'failed',
  'cancelled',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** Labels in schema order, so every screen names a status the same way. */
export const JOB_STATUS_LABEL: Readonly<Record<JobStatus, string>> = {
  pending_approval: 'Pending approval',
  queued: 'Queued',
  dispatched: 'Dispatched',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export interface Job {
  readonly id: string;
  readonly program_id: string;
  readonly tool_module_id: string;
  readonly status: JobStatus;
  readonly priority: number;
  readonly target: readonly string[];
  readonly params: Readonly<Record<string, unknown>>;
  readonly proxy_id: string | null;
  readonly schedule_id: string | null;
  readonly retry_of_job_id: string | null;
  readonly worker_id: string | null;
  /** null: the job came from a schedule. */
  readonly created_by: string | null;
  readonly approved_by: string | null;
  readonly status_reason: string | null;
  readonly created_at: string;
  readonly approved_at: string | null;
  readonly dispatched_at: string | null;
  readonly started_at: string | null;
  readonly last_heartbeat_at: string | null;
  readonly finished_at: string | null;
}

export interface JobCreateBody {
  readonly program_id: string;
  readonly tool_module_id: string;
  readonly target: readonly string[];
  readonly params?: Readonly<Record<string, unknown>>;
  readonly proxy_id?: string | null;
}

export const jobKeys = {
  all: ['jobs'] as const,
};

/** The backend checks scope and answers 422 target_out_of_scope; the frontend never does. */
export function useCreateJob() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: JobCreateBody) =>
      apiRequest<Job>('/jobs', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => client.invalidateQueries({ queryKey: jobKeys.all }),
  });
}
