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
}

export interface EnginePatchBody {
  readonly base_url?: string;
  /** Omit to keep the stored key. */
  readonly api_key?: string;
  readonly is_enabled?: boolean;
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
  return useMutation({
    mutationFn: (engineId: string) =>
      apiRequest<EngineTestResult | undefined>(`/engines/${engineId}/test`, { method: 'POST' }),
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
