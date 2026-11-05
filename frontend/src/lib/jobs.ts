'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from './api-client';
import { dispatcherKeys } from './dispatcher';
import { type Page, type Poll, withQuery } from './page';

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

export interface JobFilter {
  readonly status?: JobStatus | null;
  readonly programId?: string | null;
  readonly target?: string | null;
  readonly sort?: string | null;
  readonly limit?: number | null;
}

export const jobKeys = {
  all: ['jobs'] as const,
  list: (filter: JobFilter, cursor: string | null) =>
    [
      'jobs',
      'list',
      filter.status ?? null,
      filter.programId ?? null,
      filter.target ?? null,
      filter.sort ?? null,
      filter.limit ?? null,
      cursor,
    ] as const,
  detail: (jobId: string) => ['jobs', 'detail', jobId] as const,
};

export function useJobs(filter: JobFilter = {}, cursor: string | null = null, poll: Poll = {}) {
  return useQuery({
    ...poll,
    queryKey: jobKeys.list(filter, cursor),
    queryFn: () =>
      apiRequest<Page<Job>>(
        withQuery('/jobs', {
          status: filter.status,
          program_id: filter.programId,
          target: filter.target,
          sort: filter.sort,
          limit: filter.limit,
          cursor,
        }),
      ),
  });
}

export function useJob(jobId: string) {
  return useQuery({
    queryKey: jobKeys.detail(jobId),
    queryFn: () => apiRequest<Job>(`/jobs/${jobId}`),
  });
}

/** The backend checks scope and answers 422 target_out_of_scope; the frontend never does. */
export function useCreateJob() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: JobCreateBody) =>
      apiRequest<Job>('/jobs', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => client.invalidateQueries({ queryKey: jobKeys.all }),
  });
}

/** approve, reject and cancel answer 204; retry answers the new job. The backend decides
 * whether the move is allowed (409 conflict, 403 self_approval_forbidden). */
export type JobAction = 'approve' | 'reject' | 'cancel' | 'retry';

export function useJobAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, action }: { jobId: string; action: JobAction }) =>
      apiRequest<Job | undefined>(`/jobs/${jobId}/${action}`, { method: 'POST' }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: jobKeys.all }),
        client.invalidateQueries({ queryKey: dispatcherKeys.all }),
      ]);
    },
  });
}
