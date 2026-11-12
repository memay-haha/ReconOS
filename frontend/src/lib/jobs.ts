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

/** `job.priority`: docs/data/schema.md. The dispatcher hands out `high` first (D8). */
export const JOB_PRIORITIES = ['low', 'normal', 'high'] as const;
export type JobPriority = (typeof JOB_PRIORITIES)[number];

export const JOB_PRIORITY_LABEL: Readonly<Record<JobPriority, string>> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
};

/** The priority of a row. Kept as a function so callers need not change. */
export function jobPriorityOf(job: Pick<Job, 'priority'>): JobPriority | null {
  return job.priority;
}

export interface Job {
  readonly id: string;
  readonly program_id: string;
  readonly tool_module_id: string;
  readonly status: JobStatus;
  /** `low`, `normal` or `high` (D8). */
  readonly priority: JobPriority;
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
  // Computed on read by `GET /jobs` and `GET /jobs/{id}`: docs/api/architecture.md.
  // Optional so fixtures written before the Stitch pass still type-check.
  readonly created_by_username?: string | null;
  readonly worker_name?: string | null;
  readonly tool_module_name?: string | null;
  /** Tool version the worker reported when the job ended (N13). Column `job.tool_version`. */
  readonly tool_version?: string | null;
}

export interface JobCreateBody {
  readonly program_id: string;
  readonly tool_module_id: string;
  readonly target: readonly string[];
  readonly params?: Readonly<Record<string, unknown>>;
  readonly proxy_id?: string | null;
  /** Defaults to `normal` on the backend. */
  readonly priority?: JobPriority;
}

export interface JobFilter {
  readonly status?: JobStatus | null;
  readonly programId?: string | null;
  readonly target?: string | null;
  readonly sort?: string | null;
  readonly limit?: number | null;
  /** Substring of the target or the tool module name (N2). */
  readonly q?: string | null;
  readonly toolModuleId?: string | null;
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
      filter.q ?? null,
      filter.toolModuleId ?? null,
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
          q: filter.q === '' ? undefined : filter.q,
          tool_module_id: filter.toolModuleId,
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

/** Job and dispatcher queries both move after any queue control. */
function useQueueMutation<TArg, TResult>(send: (arg: TArg) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: send,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: jobKeys.all }),
        client.invalidateQueries({ queryKey: dispatcherKeys.all }),
      ]);
    },
  });
}

/** Dispatch Now: `POST /jobs/{id}/prioritize` raises the job to `high` and wakes the
 * dispatcher (D8). Superadmin and Admin. */
export function usePrioritizeJob() {
  return useQueueMutation((jobId: string) =>
    apiRequest<void>(`/jobs/${jobId}/prioritize`, { method: 'POST' }),
  );
}

/** Retry Failed: `POST /jobs/bulk-retry`; User only for jobs they created. */
export function useBulkRetryJobs() {
  return useQueueMutation((ids: readonly string[]) =>
    apiRequest<unknown>('/jobs/bulk-retry', { method: 'POST', body: JSON.stringify({ ids }) }),
  );
}

/** Cleanup: cancels `queued` jobs of paused or archived programs and answers how many. */
export function useCleanupJobs() {
  return useQueueMutation(() =>
    apiRequest<{ readonly cancelled?: number } | undefined>('/jobs/cleanup', { method: 'POST' }),
  );
}

/** `POST /jobs/bulk-create`: one job per tool module on the same target, all or none, each
 * checked against scope by the backend (N14). */
export interface JobBulkCreateBody {
  readonly program_id: string;
  readonly target: readonly string[];
  readonly priority?: JobPriority;
  readonly proxy_id?: string | null;
  readonly items: readonly {
    readonly tool_module_id: string;
    readonly params?: Readonly<Record<string, unknown>>;
  }[];
}

export function useBulkCreateJobs() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: JobBulkCreateBody) =>
      apiRequest<unknown>('/jobs/bulk-create', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => client.invalidateQueries({ queryKey: jobKeys.all }),
  });
}
