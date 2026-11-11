'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from './api-client';

export type DiagnosticStatus = 'running' | 'passed' | 'failed';

/** A row of `diagnostic_run` (D4). `output` is plain text, one check per line, with no
 * credential, path or PID: docs/data/schema.md. */
export interface DiagnosticRun {
  readonly id: string;
  readonly status: DiagnosticStatus;
  /** 0 when every check passed, 1 when one did not; null while running. */
  readonly exit_code: number | null;
  readonly output: string | null;
  readonly created_at: string;
  readonly finished_at: string | null;
}

export const diagnosticKeys = {
  all: ['diagnostics'] as const,
  latest: ['diagnostics', 'latest'] as const,
  run: (id: string) => ['diagnostics', 'run', id] as const,
};

/** How often an open run is re-read while the background process works on it. */
const RUNNING_POLL_MS = 1_000;

/** Superadmin and Admin only. A 404 means no run yet. */
export function useLatestDiagnostic(enabled = true) {
  return useQuery({
    queryKey: diagnosticKeys.latest,
    queryFn: () => apiRequest<DiagnosticRun>('/system/diagnostics/latest'),
    enabled,
    retry: false,
  });
}

/** One run, re-read every second until it leaves `running`. */
export function useDiagnostic(id: string | null) {
  return useQuery({
    queryKey: diagnosticKeys.run(id ?? ''),
    queryFn: () => apiRequest<DiagnosticRun>(`/system/diagnostics/${id ?? ''}`),
    enabled: id !== null,
    refetchInterval: (query) =>
      query.state.data === undefined || query.state.data.status === 'running'
        ? RUNNING_POLL_MS
        : false,
  });
}

export function useRunDiagnostics() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<Pick<DiagnosticRun, 'id' | 'status'>>('/system/diagnostics', { method: 'POST' }),
    onSuccess: () => client.invalidateQueries({ queryKey: diagnosticKeys.latest }),
  });
}
