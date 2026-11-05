'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from './api-client';
import { type Page, withQuery } from './page';

export const COMPONENT_STATUSES = ['ok', 'degraded', 'down'] as const;
export type ComponentStatus = (typeof COMPONENT_STATUSES)[number];

export interface HealthComponent {
  /** A component of docs/architecture/system.md: api, dispatcher, postgres, osmedeus... */
  readonly name: string;
  /** Computed by the backend; the screen only shows it. */
  readonly status: ComponentStatus;
  readonly latency_ms: number | null;
  readonly checked_at: string;
}

/** `GET /system/health`: docs/api/architecture.md, section on aggregate responses. */
export interface SystemHealth {
  readonly components: readonly HealthComponent[];
  readonly queue_length: number;
  readonly workers_online: number;
}

/** A row of `system_setting`. `value` is jsonb; the documented keys hold numbers. */
export interface SystemSetting {
  readonly key: string;
  readonly value: unknown;
  readonly updated_by: string | null;
  readonly updated_at: string;
}

export const systemKeys = {
  health: ['system', 'health'] as const,
  settings: ['system-settings'] as const,
  settingsPage: (cursor: string | null) => ['system-settings', 'list', cursor] as const,
};

/** Superadmin and Admin only: pass `enabled` false for a User. */
export function useSystemHealth(enabled = true) {
  return useQuery({
    queryKey: systemKeys.health,
    queryFn: () => apiRequest<SystemHealth>('/system/health'),
    enabled,
  });
}

/** Superadmin only: pass `enabled` false for anyone else instead of collecting a 403. */
export function useSystemSettings(cursor: string | null = null, enabled = true) {
  return useQuery({
    queryKey: systemKeys.settingsPage(cursor),
    queryFn: () =>
      apiRequest<Page<SystemSetting>>(withQuery('/system-settings', { limit: 200, cursor })),
    enabled,
  });
}

export function usePatchSystemSetting() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) =>
      apiRequest<SystemSetting>(`/system-settings/${encodeURIComponent(key)}`, {
        method: 'PATCH',
        body: JSON.stringify({ value }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: systemKeys.settings }),
  });
}
