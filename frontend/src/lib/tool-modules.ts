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

export const toolModuleKeys = {
  all: ['tool-modules'] as const,
  list: (cursor: string | null) => ['tool-modules', 'list', cursor] as const,
};

export function useToolModules(cursor: string | null = null) {
  return useQuery({
    queryKey: toolModuleKeys.list(cursor),
    queryFn: () => apiRequest<Page<ToolModule>>(withQuery('/tool-modules', { limit: 200, cursor })),
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
