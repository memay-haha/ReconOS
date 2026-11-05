'use client';

import { useQuery } from '@tanstack/react-query';

import { apiRequest } from './api-client';

/** `GET /dispatcher/status`: docs/api/architecture.md, section on computed fields. Each map
 * counts `queued` jobs, keyed by tool module id and by program id. */
export interface DispatcherStatus {
  readonly last_heartbeat_at: string | null;
  readonly queued_by_tool_module: Readonly<Record<string, number>>;
  readonly queued_by_program: Readonly<Record<string, number>>;
}

export const dispatcherKeys = {
  all: ['dispatcher'] as const,
  status: ['dispatcher', 'status'] as const,
};

export function useDispatcherStatus() {
  return useQuery({
    queryKey: dispatcherKeys.status,
    queryFn: () => apiRequest<DispatcherStatus>('/dispatcher/status'),
  });
}
