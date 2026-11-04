'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from './api-client';

export interface SessionRow {
  readonly id: string;
  readonly user_id: string;
  readonly ip_address: string | null;
  readonly user_agent: string | null;
  readonly created_at: string;
  readonly last_seen_at: string;
  readonly expires_at: string;
}

export interface SessionPage {
  readonly items: readonly SessionRow[];
  readonly next_cursor: string | null;
  readonly total: number;
  readonly total_is_estimate: boolean;
}

export const sessionKeys = {
  all: ['sessions'] as const,
  active: ['sessions', 'active'] as const,
  ofUser: (userId: string) => ['sessions', 'user', userId] as const,
};

/** Superadmin only: the backend answers 403 to anyone else, which surfaces as an error state. */
export function useActiveSessionCount() {
  return useQuery({
    queryKey: sessionKeys.active,
    queryFn: () => apiRequest<SessionPage>('/user-sessions'),
    select: (page) => page.total,
  });
}

/** A null userId (no account selected) disables the query, so no request is sent. */
export function useUserSessions(userId: string | null) {
  return useQuery({
    queryKey: sessionKeys.ofUser(userId ?? ''),
    queryFn: () => apiRequest<SessionPage>(`/users/${userId as string}/sessions`),
    enabled: userId !== null,
  });
}

/** Superadmin only: a refusal surfaces as the mutation error. */
export function useRevokeSession() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) =>
      apiRequest<void>(`/user-sessions/${sessionId}`, { method: 'DELETE' }),
    // On settle, not only on success: after a 404 the session is already gone, and the
    // refetch removes the dead row. The prefix covers the per-account list and the count.
    onSettled: () => client.invalidateQueries({ queryKey: sessionKeys.all }),
  });
}
