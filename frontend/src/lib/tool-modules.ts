'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from './api-client';
import { type Page, withQuery } from './page';

/** Recon, scan, exploit: docs/appendix/glossary.md. Exploit jobs wait for approval. */
export const TOOL_GROUPS = ['recon', 'scan', 'exploit'] as const;
export type ToolGroup = (typeof TOOL_GROUPS)[number];

export interface ToolModule {
  readonly id: string;
  readonly name: string;
  readonly group: ToolGroup;
  readonly is_enabled: boolean;
  readonly default_params: Readonly<Record<string, unknown>>;
  readonly max_concurrency: number;
  readonly rate_limit_per_minute: number | null;
  readonly timeout_minutes: number;
  readonly updated_at: string;
}

/** Why a tool module cannot run now; `null` on the row means it is ready:
 * docs/api/architecture.md, computed fields. */
export const DISABLED_REASONS = ['off', 'engine_disabled', 'engine_down', 'not_installed'] as const;
export type DisabledReason = (typeof DISABLED_REASONS)[number];

/** `status` of the engine component in `GET /system/health`. */
export type EngineStatus = 'ok' | 'degraded' | 'down';

/** One parameter of the allowlist the tool module declares in code. */
export interface ParamSpec {
  readonly type?: string;
  readonly title?: string;
  readonly description?: string;
  readonly default?: unknown;
  readonly minimum?: number;
  readonly maximum?: number;
}

/** The parameter allowlist as JSON Schema: only `properties` drives the screen. */
export interface ParamSchema {
  readonly properties?: Readonly<Record<string, ParamSpec>>;
}

/** A row of `GET /tool-modules`: the columns plus what the API reads from code and computes. */
export interface ToolModuleRow extends ToolModule {
  readonly title: string;
  readonly description: string;
  /** Engine name; `null` when the tool module runs a tool directly on the worker. */
  readonly runs_on: string | null;
  readonly tools: readonly string[];
  readonly output_types: readonly string[];
  /** Takes a wildcard target `*.example.com`: docs/architecture/business-flow.md. */
  readonly accepts_wildcard: boolean;
  readonly param_schema: ParamSchema;
  readonly last_job_at: string | null;
  readonly jobs_24h: number;
  readonly finding_count: number;
  readonly engine_status: EngineStatus | null;
  readonly disabled_reason: DisabledReason | null;
  readonly estimated_seconds: number | null;
}

/** The list carries totals over every row, ignoring filters and paging. */
export interface ToolModuleList extends Page<ToolModuleRow> {
  readonly enabled_count: number;
  readonly disabled_count: number;
  readonly disabled_names: readonly string[];
  readonly group_counts: Readonly<Record<ToolGroup, number>>;
  readonly engines_bound: number;
  readonly installed_count: number;
}

export interface ToolModuleFilter {
  readonly q?: string | null;
  readonly group?: ToolGroup | null;
  readonly runsOn?: string | null;
  readonly isEnabled?: boolean | null;
}

export const toolModuleKeys = {
  all: ['tool-modules'] as const,
  list: (cursor: string | null, filter: ToolModuleFilter = {}) =>
    [
      'tool-modules',
      'list',
      cursor,
      filter.q ?? null,
      filter.group ?? null,
      filter.runsOn ?? null,
      filter.isEnabled ?? null,
    ] as const,
  stats: (window: StatsWindow) => ['tool-modules', 'stats', window] as const,
};

export function useToolModules(cursor: string | null = null, filter: ToolModuleFilter = {}) {
  return useQuery({
    queryKey: toolModuleKeys.list(cursor, filter),
    queryFn: () =>
      apiRequest<ToolModuleList>(
        withQuery('/tool-modules', {
          limit: 200,
          cursor,
          q: filter.q,
          group: filter.group,
          runs_on: filter.runsOn,
          is_enabled: filter.isEnabled,
        }),
      ),
  });
}

export type StatsWindow = '24h' | '7d' | '30d';

/** `GET /tool-modules/stats`: jobs created in the window and the one before, and running jobs
 * whose heartbeat is overdue. */
export interface ToolModuleStats {
  readonly jobs: number;
  readonly jobs_prev: number;
  readonly stalled: number;
}

export function useToolModuleStats(window: StatsWindow = '24h') {
  return useQuery({
    queryKey: toolModuleKeys.stats(window),
    queryFn: () => apiRequest<ToolModuleStats>(withQuery('/tool-modules/stats', { window })),
  });
}

/** The columns of `tool_module` a Superadmin may change. The group and the parameter schema
 * live in code, not here. */
export interface ToolModulePatchBody {
  readonly is_enabled?: boolean;
  readonly default_params?: Readonly<Record<string, unknown>>;
  readonly max_concurrency?: number;
  readonly rate_limit_per_minute?: number | null;
  readonly timeout_minutes?: number;
}

export function usePatchToolModule() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ toolModuleId, body }: { toolModuleId: string; body: ToolModulePatchBody }) =>
      apiRequest<ToolModule>(`/tool-modules/${toolModuleId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: toolModuleKeys.all }),
  });
}
