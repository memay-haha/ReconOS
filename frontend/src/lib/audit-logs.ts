'use client';

import { useQuery } from '@tanstack/react-query';

import { apiRequest } from './api-client';

export interface AuditLogRow {
  readonly id: string;
  readonly user_id: string | null;
  readonly action: string;
  readonly resource_type: string | null;
  readonly resource_id: string | null;
  readonly detail: Record<string, unknown> | null;
  readonly ip_address: string | null;
  readonly created_at: string;
}

export interface AuditLogPage {
  readonly items: readonly AuditLogRow[];
  readonly next_cursor: string | null;
  readonly total: number;
  readonly total_is_estimate: boolean;
}

export interface AuditLogFilter {
  readonly userId: string | null;
  readonly action: string | null;
}

export const auditLogKeys = {
  all: ['audit-logs'] as const,
  page: (filter: AuditLogFilter, cursor: string | null) =>
    ['audit-logs', filter.userId, filter.action, cursor] as const,
};

/** An absent filter is absent from the URL, never an empty value. */
function buildPath(filter: AuditLogFilter, cursor: string | null): string {
  const query = new URLSearchParams();
  if (filter.userId !== null) query.set('user_id', filter.userId);
  if (filter.action !== null) query.set('action', filter.action);
  if (cursor !== null) query.set('cursor', cursor);
  const suffix = query.toString();
  return suffix === '' ? '/audit-logs' : `/audit-logs?${suffix}`;
}

export function useAuditLogs(filter: AuditLogFilter, cursor: string | null) {
  return useQuery({
    queryKey: auditLogKeys.page(filter, cursor),
    queryFn: () => apiRequest<AuditLogPage>(buildPath(filter, cursor)),
  });
}
