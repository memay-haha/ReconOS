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
  /** Optional until the backend returns them: docs/api/architecture.md. */
  readonly version?: string | null;
  /** postgres: connections used/max. redis: used_memory/maxmemory. Others null (M33). */
  readonly detail?: string | null;
  /** Why the component is not `ok`, computed by the backend. */
  readonly message?: string | null;
}

/** `GET /system/health`: docs/api/architecture.md, section on aggregate responses. */
export interface SystemHealth {
  readonly components: readonly HealthComponent[];
  readonly queue_length: number;
  readonly workers_online: number;
  /** Enabled tool modules present on at least one online worker, over all tool modules (M34). */
  readonly tools_installed?: { readonly installed: number; readonly total: number };
  /** Running jobs over the summed `max_concurrency` of enabled tool modules, 0..1 (M24). */
  readonly fleet_load?: number | null;
}

/** How often S15 re-reads the health snapshot on its own (the mockup's TICK 30s). */
export const HEALTH_POLL_MS = 30_000;

/** A threshold of docs/ops/configuration.md: every documented key, stored or not. */
export interface SystemSetting {
  readonly key: string;
  readonly value: number;
  readonly default: number;
  /** Inclusive bounds the backend enforces; the form only hints them. */
  readonly minimum: number;
  readonly maximum: number;
  /** Admin and User may read it (column Đọc công khai). */
  readonly is_public: boolean;
  /** Both null while the key still uses its default. */
  readonly updated_by: string | null;
  readonly updated_at: string | null;
}

export const systemKeys = {
  health: ['system', 'health'] as const,
  settings: ['system-settings'] as const,
  settingsPage: (cursor: string | null) => ['system-settings', 'list', cursor] as const,
  setting: (key: string) => ['system-settings', 'key', key] as const,
};

/** Superadmin and Admin only: pass `enabled` false for a User. `poll` re-reads on a timer. */
export function useSystemHealth(enabled = true, poll: number | false = false) {
  return useQuery({
    queryKey: systemKeys.health,
    queryFn: () => apiRequest<SystemHealth>('/system/health'),
    enabled,
    refetchInterval: poll,
  });
}

/** Re-checks one component (`GET /system/health?component=`) and folds the fresh row into
 * the cached snapshot, so the other cards keep their values. */
export function useRecheckComponent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiRequest<SystemHealth>(withQuery('/system/health', { component: name })),
    onSuccess: (fresh, name) => {
      const row = fresh.components.find((c) => c.name === name);
      if (row === undefined) return;
      client.setQueryData<SystemHealth>(systemKeys.health, (current) =>
        current === undefined
          ? fresh
          : {
              ...current,
              components: current.components.map((c) => (c.name === name ? row : c)),
            },
      );
    },
  });
}

/** One `system_setting` by key. Superadmin reads every key, others only public ones. */
export function useSystemSetting(key: string, enabled = true) {
  return useQuery({
    queryKey: systemKeys.setting(key),
    queryFn: () => apiRequest<SystemSetting>(`/system-settings/${encodeURIComponent(key)}`),
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
