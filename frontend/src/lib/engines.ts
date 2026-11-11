'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from './api-client';
import { type Page, withQuery } from './page';

/** A row of `engine` as the API returns it. The API key is never part of a response:
 * it is write-only on screen, and an empty field keeps the stored key. */
export interface Engine {
  readonly id: string;
  readonly name: string;
  readonly base_url: string;
  readonly is_enabled: boolean;
  readonly settings: Readonly<Record<string, unknown>>;
  readonly updated_by: string | null;
  readonly updated_at: string;
  // Computed and stored fields of `GET /engines`: docs/api/architecture.md. Optional until
  // the backend returns them.
  /** Version reported by the last connection test or health check. */
  readonly version?: string | null;
  readonly last_tested_at?: string | null;
  readonly last_test_ok?: boolean | null;
  /** Last change of the engine API key, not of any other field. */
  readonly api_key_updated_at?: string | null;
  /** Vigolium: whether an LLM API key is stored. The key itself is never returned. */
  readonly has_llm_api_key?: boolean;
  /** Seconds since `engine.ok_since`, null when the engine is not `ok` (M35). */
  readonly uptime_seconds?: number | null;
  /** Running jobs and summed `max_concurrency` of the enabled tool modules on this engine (M24). */
  readonly slots_used?: number;
  readonly slots_total?: number;
}

/** `engine.settings` keys: docs/data/schema.md. */
export const SCAN_PRESETS = ['quick', 'balanced', 'deep'] as const;
export type ScanPreset = (typeof SCAN_PRESETS)[number];

export interface EngineSettings {
  /** Osmedeus. */
  readonly scan_preset?: ScanPreset;
  /** Vigolium. */
  readonly llm_provider?: string;
  readonly llm_model?: string;
  readonly llm_base_url?: string;
}

export interface EnginePatchBody {
  readonly base_url?: string;
  /** Omit to keep the stored key. */
  readonly api_key?: string;
  readonly is_enabled?: boolean;
  readonly settings?: EngineSettings;
  /** Vigolium LLM key, write-only (G7). Omit to keep the stored key. */
  readonly llm_api_key?: string;
}

/** A workflow installed on Osmedeus, read through the engine's REST (D3-B). */
export interface EngineWorkflow {
  readonly name: string;
  /** Osmedeus kinds: `flow` or `module`. */
  readonly kind: string;
  readonly step_count: number | null;
  readonly description: string | null;
  readonly tags: readonly string[];
}

export interface EngineWorkflowDetail extends EngineWorkflow {
  readonly steps: readonly { readonly name: string; readonly description: string | null }[];
}

/** A Vigolium native module (D3-B). */
export interface EngineModule {
  readonly name: string;
  /** `active` sends traffic, `passive` only reads it. */
  readonly kind: 'active' | 'passive';
  readonly is_enabled: boolean;
  readonly description: string | null;
}

/** `POST /engines/{id}/validate` and `/verify-model`: one result line per check. */
export interface EngineCheckResult {
  readonly ok: boolean;
  readonly issues: readonly { readonly level: 'critical' | 'advisory'; readonly message: string }[];
}

/** `POST /engines/{id}/test` answers 200 when the engine replied. */
export interface EngineTestResult {
  readonly version?: string | null;
}

/** A row of `engine_variable`. The value is never returned. */
export interface EngineVariable {
  readonly id: string;
  readonly engine_id: string;
  readonly key: string;
  readonly updated_by: string | null;
  readonly updated_at: string;
}

export const engineKeys = {
  all: ['engines'] as const,
  list: ['engines', 'list'] as const,
  variables: (engineId: string) => ['engines', engineId, 'variables'] as const,
  variablePage: (engineId: string, cursor: string | null) =>
    ['engines', engineId, 'variables', cursor] as const,
  workflows: (engineId: string) => ['engines', engineId, 'workflows'] as const,
  workflow: (engineId: string, name: string) => ['engines', engineId, 'workflows', name] as const,
  modules: (engineId: string) => ['engines', engineId, 'modules'] as const,
};

export function useEngines(enabled = true) {
  return useQuery({
    queryKey: engineKeys.list,
    queryFn: () => apiRequest<Page<Engine>>(withQuery('/engines', { limit: 200 })),
    enabled,
  });
}

export function usePatchEngine() {
  const client = useQueryClient();
  return useMutation({
    // The variables may carry an API key; drop them as soon as the call settles.
    gcTime: 0,
    mutationFn: ({ engineId, body }: { engineId: string; body: EnginePatchBody }) =>
      apiRequest<Engine>(`/engines/${engineId}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => client.invalidateQueries({ queryKey: engineKeys.list }),
  });
}

export function useTestEngine() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (engineId: string) =>
      apiRequest<EngineTestResult | undefined>(`/engines/${engineId}/test`, { method: 'POST' }),
    // The test stores version, last_tested_at and last_test_ok on the engine row.
    onSettled: () => client.invalidateQueries({ queryKey: engineKeys.list }),
  });
}

/** Osmedeus workflows, read live from the engine on each call. */
export function useEngineWorkflows(engineId: string | null) {
  return useQuery({
    queryKey: engineKeys.workflows(engineId ?? ''),
    queryFn: () =>
      apiRequest<Page<EngineWorkflow>>(
        withQuery(`/engines/${engineId ?? ''}/workflows`, { limit: 200 }),
      ),
    enabled: engineId !== null,
  });
}

export function useEngineWorkflow(engineId: string | null, name: string | null) {
  return useQuery({
    queryKey: engineKeys.workflow(engineId ?? '', name ?? ''),
    queryFn: () =>
      apiRequest<EngineWorkflowDetail>(
        `/engines/${engineId ?? ''}/workflows/${encodeURIComponent(name ?? '')}`,
      ),
    enabled: engineId !== null && name !== null,
  });
}

/** Vigolium native modules, read live from the engine on each call. */
export function useEngineModules(engineId: string | null) {
  return useQuery({
    queryKey: engineKeys.modules(engineId ?? ''),
    queryFn: () =>
      apiRequest<Page<EngineModule>>(
        withQuery(`/engines/${engineId ?? ''}/modules`, { limit: 200 }),
      ),
    enabled: engineId !== null,
  });
}

/** Turns native modules on or off: body `modules` of `{name, is_enabled}`. */
export function usePatchEngineModules() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      engineId,
      modules,
    }: {
      engineId: string;
      modules: readonly { name: string; is_enabled: boolean }[];
    }) =>
      apiRequest<unknown>(`/engines/${engineId}/modules`, {
        method: 'PATCH',
        body: JSON.stringify({ modules }),
      }),
    onSettled: (_data, _error, { engineId }) =>
      client.invalidateQueries({ queryKey: engineKeys.modules(engineId) }),
  });
}

export function useValidateEngine() {
  return useMutation({
    mutationFn: (engineId: string) =>
      apiRequest<EngineCheckResult>(`/engines/${engineId}/validate`, { method: 'POST' }),
  });
}

export function useVerifyModel() {
  return useMutation({
    mutationFn: (engineId: string) =>
      apiRequest<EngineCheckResult>(`/engines/${engineId}/verify-model`, { method: 'POST' }),
  });
}

export function useEngineVariables(engineId: string | null, cursor: string | null) {
  return useQuery({
    queryKey: engineKeys.variablePage(engineId ?? '', cursor),
    queryFn: () =>
      apiRequest<Page<EngineVariable>>(
        withQuery(`/engines/${engineId ?? ''}/variables`, { cursor }),
      ),
    enabled: engineId !== null,
  });
}

export function usePutEngineVariable() {
  const client = useQueryClient();
  return useMutation({
    // The value is a credential: never keep it in the mutation cache.
    gcTime: 0,
    mutationFn: ({ engineId, key, value }: { engineId: string; key: string; value: string }) =>
      apiRequest<void>(`/engines/${engineId}/variables/${encodeURIComponent(key)}`, {
        method: 'PUT',
        body: JSON.stringify({ value }),
      }),
    onSuccess: (_data, { engineId }) =>
      client.invalidateQueries({ queryKey: engineKeys.variables(engineId) }),
  });
}

export function useDeleteEngineVariable() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ engineId, key }: { engineId: string; key: string }) =>
      apiRequest<void>(`/engines/${engineId}/variables/${encodeURIComponent(key)}`, {
        method: 'DELETE',
      }),
    onSuccess: (_data, { engineId }) =>
      client.invalidateQueries({ queryKey: engineKeys.variables(engineId) }),
  });
}
