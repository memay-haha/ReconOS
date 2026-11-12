'use client';

import { useQuery } from '@tanstack/react-query';

import { apiRequest } from './api-client';
import { type Page, withQuery } from './page';

export type ToolStatus = 'installed' | 'missing';

/** A row of `GET /tools` (D4): one tool of the tool modules, with the version each online
 * worker reported in its heartbeat. Latest upstream, paths and update are out (D4). */
export interface Tool {
  readonly name: string;
  readonly tool_modules: readonly string[];
  readonly status: ToolStatus;
  readonly installed: readonly { readonly worker_name: string; readonly version: string | null }[];
}

export const toolKeys = { all: ['tools'] as const };

/** Superadmin and Admin only: pass `enabled` false for a User. */
export function useTools(enabled = true) {
  return useQuery({
    queryKey: toolKeys.all,
    queryFn: () => apiRequest<Page<Tool>>(withQuery('/tools', { limit: 200 })),
    enabled,
  });
}
