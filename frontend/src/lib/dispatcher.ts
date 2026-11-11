'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from './api-client';

/** `GET /dispatcher/status`: docs/api/architecture.md, section on computed fields. Each map
 * counts `queued` jobs, keyed by tool module id and by program id. */
export interface DispatcherStatus {
  readonly last_heartbeat_at: string | null;
  readonly queued_by_tool_module: Readonly<Record<string, number>>;
  readonly queued_by_program: Readonly<Record<string, number>>;
  /** From the dispatcher heartbeat, computed by the backend; the topbar pill shows it. */
  readonly status?: 'ok' | 'degraded' | 'down';
  // Queue gauges of S10, computed by the backend: docs/api/architecture.md. Optional until
  // the backend returns them; a gauge shows "-" when absent.
  readonly queued_total?: number;
  /** `system_setting` queue_capacity, the denominator of Queue Depth Pressure (M23). */
  readonly queue_capacity?: number;
  readonly workers_online?: number;
  readonly running_total?: number;
  /** Summed `max_concurrency` of enabled tool modules (M24). */
  readonly slot_capacity?: number;
  readonly jobs_per_minute?: number;
  /** Mean wait from approval (or creation) to start, jobs started in the last hour (M25). */
  readonly avg_wait_seconds?: number | null;
  /** Redis `used_memory` (M26). */
  readonly redis_used_bytes?: number | null;
  readonly last_dispatched_at?: string | null;
  readonly last_dispatched_tool_module?: string | null;
}

export const dispatcherKeys = {
  all: ['dispatcher'] as const,
  status: ['dispatcher', 'status'] as const,
};

export function useDispatcherStatus(refetchInterval: number | false = false, enabled = true) {
  return useQuery({
    queryKey: dispatcherKeys.status,
    queryFn: () => apiRequest<DispatcherStatus>('/dispatcher/status'),
    refetchInterval,
    enabled,
  });
}

/** Dispatch All: `POST /dispatcher/wake` runs one dispatch round now (D8). Jobs move too,
 * so every job list refetches: the key is spelled out to keep this file free of jobs.ts. */
export function useWakeDispatcher() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest<void>('/dispatcher/wake', { method: 'POST' }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: dispatcherKeys.all }),
        client.invalidateQueries({ queryKey: ['jobs'] }),
      ]);
    },
  });
}
