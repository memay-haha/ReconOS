'use client';

import { useQuery } from '@tanstack/react-query';

import { apiRequest } from './api-client';
import { type Page, withQuery } from './page';

/** `GET /workers`, Superadmin and Admin only. Hide the panel from User instead of showing a 403. */
export interface Worker {
  readonly id: string;
  readonly name: string;
  /** Tool modules the worker reported in its last heartbeat. */
  readonly tool_modules: readonly string[];
  readonly last_heartbeat_at: string | null;
  readonly created_at: string;
  // Computed on read since the Stitch pass: docs/api/openapi.yaml `GET /workers`.
  readonly is_online?: boolean;
  readonly running_job_count?: number;
  readonly running_tool_module_ids?: readonly string[];
  /** CPU load the worker reports in its heartbeat, 0 to 100 (D8). */
  readonly cpu_percent?: number | null;
}

export const workerKeys = {
  all: ['workers'] as const,
  list: (cursor: string | null) => ['workers', 'list', cursor] as const,
};

export function useWorkers(cursor: string | null = null, enabled = true) {
  return useQuery({
    queryKey: workerKeys.list(cursor),
    queryFn: () => apiRequest<Page<Worker>>(withQuery('/workers', { limit: 200, cursor })),
    enabled,
  });
}
