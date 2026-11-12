'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from './api-client';
import { type Page, withQuery } from './page';

/** A proxy as the list returns it. The URL may hold a user name and password, so the
 * screen never shows it: it is write-only here, like an API key. */
export interface Proxy {
  readonly id: string;
  readonly program_id: string;
  readonly name: string;
  readonly is_enabled: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ProxyBody {
  readonly name: string;
  /** Sent on create, or on edit to replace the stored URL; never read back. */
  readonly url?: string;
  readonly is_enabled?: boolean;
}

export const proxyKeys = {
  all: ['proxies'] as const,
  list: (programId: string, cursor: string | null) =>
    ['proxies', 'list', programId, cursor] as const,
};

export function useProxies(programId: string, cursor: string | null = null, enabled = true) {
  return useQuery({
    queryKey: proxyKeys.list(programId, cursor),
    queryFn: () => apiRequest<Page<Proxy>>(withQuery(`/programs/${programId}/proxies`, { cursor })),
    enabled,
  });
}

function useProxyMutation<TArg>(send: (arg: TArg) => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({
    // The URL is a credential: do not keep it in the mutation cache once the call settles.
    gcTime: 0,
    mutationFn: send,
    onSuccess: () => client.invalidateQueries({ queryKey: proxyKeys.all }),
  });
}

export function useCreateProxy(programId: string) {
  return useProxyMutation((body: ProxyBody) =>
    apiRequest<Proxy>(`/programs/${programId}/proxies`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}

export function useUpdateProxy() {
  return useProxyMutation(({ id, body }: { id: string; body: Partial<ProxyBody> }) =>
    apiRequest<Proxy>(`/proxies/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  );
}

export function useDeleteProxy() {
  return useProxyMutation((id: string) => apiRequest<void>(`/proxies/${id}`, { method: 'DELETE' }));
}
