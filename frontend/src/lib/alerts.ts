'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from './api-client';
import { type Page, withQuery } from './page';

/** `alert.alert_type` in docs/data/schema.md. */
export type AlertType =
  'finding_new' | 'job_pending_approval' | 'job_failed' | 'asset_new' | 'cert_expiring';

/** A row of `GET /alerts`: docs/api/architecture.md. `is_read` is the calling account's. */
export interface Alert {
  readonly id: string;
  readonly alert_type: AlertType;
  /** Built by the backend from target data: render as text. */
  readonly message: string;
  readonly program_id: string | null;
  readonly finding_id: string | null;
  readonly job_id: string | null;
  readonly created_at: string;
  readonly is_read: boolean;
}

export const alertKeys = {
  all: ['alerts'] as const,
  list: (limit: number) => ['alerts', 'list', limit] as const,
  unread: ['alerts', 'unread'] as const,
};

/** The newest alerts for the bell's list. */
export function useAlerts(limit = 10, enabled = true) {
  return useQuery({
    queryKey: alertKeys.list(limit),
    queryFn: () => apiRequest<Page<Alert>>(withQuery('/alerts', { sort: '-created_at', limit })),
    enabled,
  });
}

/** How many alerts the account has not read: the `total` of `is_read=false`. */
export function useUnreadAlertCount() {
  return useQuery({
    queryKey: alertKeys.unread,
    queryFn: () => apiRequest<Page<Alert>>(withQuery('/alerts', { is_read: false, limit: 1 })),
    select: (page) => page.total,
    staleTime: 30_000,
  });
}

export function useMarkAlertRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (alertId: string) =>
      apiRequest<void>(`/alerts/${encodeURIComponent(alertId)}/read`, { method: 'POST' }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: alertKeys.all }),
  });
}

export function useMarkAllAlertsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest<void>('/alerts/read-all', { method: 'POST' }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: alertKeys.all }),
  });
}

/** The screen an alert leads to: S10 opens one job from `?job=`; S20 opens no single
 * finding from the URL yet, so a finding alert opens the list; otherwise S09. */
export function alertHref(alert: Alert): string | null {
  if (alert.finding_id !== null) return '/findings';
  if (alert.job_id !== null) return `/queue?job=${encodeURIComponent(alert.job_id)}`;
  if (alert.program_id !== null) return `/programs/${encodeURIComponent(alert.program_id)}`;
  return null;
}
