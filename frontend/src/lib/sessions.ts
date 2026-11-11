'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from './api-client';
import { withQuery } from './page';

export interface SessionRow {
  readonly id: string;
  readonly user_id: string;
  readonly ip_address: string | null;
  readonly user_agent: string | null;
  readonly created_at: string;
  readonly last_seen_at: string;
  readonly expires_at: string;
  /** `GET /user-sessions` only: the account the session belongs to. */
  readonly username?: string;
  readonly display_name?: string;
}

export interface SessionPage {
  readonly items: readonly SessionRow[];
  readonly next_cursor: string | null;
  readonly total: number;
  readonly total_is_estimate: boolean;
  /** `GET /user-sessions` only: accounts with at least one active session (M31). Optional
   * until the backend returns it. */
  readonly account_count?: number;
}

export type SessionSort = 'last_seen_at' | '-last_seen_at' | 'created_at' | '-created_at';

export const sessionKeys = {
  all: ['sessions'] as const,
  active: ['sessions', 'active'] as const,
  ofUser: (userId: string) => ['sessions', 'user', userId] as const,
  list: (cursor: string | null, sort: SessionSort) => ['sessions', 'list', sort, cursor] as const,
};

/** Every active session of every account, Superadmin only. */
export function useAllSessions(cursor: string | null, sort: SessionSort = '-last_seen_at') {
  return useQuery({
    queryKey: sessionKeys.list(cursor, sort),
    queryFn: () => apiRequest<SessionPage>(withQuery('/user-sessions', { sort, cursor })),
  });
}

/** The figures of the Active Sessions tile: the session total and `account_count`. */
export function useActiveSessionSummary(enabled = true) {
  return useQuery({
    queryKey: sessionKeys.active,
    queryFn: () => apiRequest<SessionPage>('/user-sessions'),
    select: (page) => ({ total: page.total, accountCount: page.account_count ?? null }),
    enabled,
  });
}

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
