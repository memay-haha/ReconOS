'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from './api-client';
import { withQuery } from './page';
import { sessionKeys } from './sessions';
import type { CurrentUser } from './auth';

/** What every endpoint that returns an account carries, writes included. */
export interface UserCore {
  readonly id: string;
  readonly username: string;
  readonly display_name: string;
  readonly role: CurrentUser['role'];
  readonly is_locked: boolean;
  readonly created_at: string;
  readonly last_login_at: string | null;
}

/** A row of `GET /users`. The count is computed from `user_session` on each read, so
 * `POST /users` and `PATCH /users/{id}` answer a `UserCore` without it: never copy a
 * write response into this row, refetch instead (every mutation invalidates `userKeys.all`). */
export interface UserRow extends UserCore {
  readonly active_user_session_count: number;
  /** Superadmin only: `ip_address` and `last_seen_at` of the newest active session, null
   * when there is none. Optional until the backend returns them (docs/api/architecture.md). */
  readonly last_session_ip?: string | null;
  readonly last_seen_at?: string | null;
}

export type UserRole = UserRow['role'];

export const USER_ROLES: readonly UserRole[] = ['superadmin', 'admin', 'user'];

export interface UserPage {
  readonly items: readonly UserRow[];
  readonly next_cursor: string | null;
  readonly total: number;
  readonly total_is_estimate: boolean;
  /** Superadmin only, over every account the caller sees, ignoring filters and paging.
   * Optional until the backend returns them. */
  readonly role_counts?: Readonly<Record<UserRole, number>>;
  readonly locked_count?: number;
}

export interface UserFilter {
  /** Matches `username` and `display_name`. */
  readonly q?: string | null;
  readonly role?: UserRole | null;
  readonly limit?: number;
}

export const userKeys = {
  all: ['users'] as const,
  page: (cursor: string | null, filter: UserFilter = {}) =>
    ['users', 'page', filter.q ?? null, filter.role ?? null, filter.limit ?? null, cursor] as const,
};

export function useUsers(cursor: string | null, filter: UserFilter = {}) {
  return useQuery({
    queryKey: userKeys.page(cursor, filter),
    queryFn: () =>
      apiRequest<UserPage>(
        withQuery('/users', { q: filter.q, role: filter.role, limit: filter.limit, cursor }),
      ),
  });
}

/** `GET /users/export`: a plain link, the browser downloads the stream. Superadmin only. */
export function userExportHref(filter: UserFilter, ids: readonly string[] = []): string {
  return `/api/v1${withQuery('/users/export', { format: 'csv', q: filter.q, role: filter.role, ids })}`;
}

export interface UserCreateBody {
  readonly username: string;
  readonly display_name: string;
  readonly password: string;
  readonly role: UserRow['role'];
}

export interface UserUpdateBody {
  readonly display_name?: string;
  readonly role?: UserRow['role'];
}

function useUserMutation<TBody>(
  send: (body: TBody) => Promise<unknown>,
  alsoInvalidate: readonly (readonly string[])[] = [],
) {
  const client = useQueryClient();
  return useMutation({
    // A create body carries a password. gcTime 0 drops the variables once the call settles.
    gcTime: 0,
    mutationFn: send,
    onSuccess: () =>
      Promise.all(
        [userKeys.all, ...alsoInvalidate].map((queryKey) => client.invalidateQueries({ queryKey })),
      ),
  });
}

export function useCreateUser() {
  return useUserMutation((body: UserCreateBody) =>
    apiRequest<UserCore>('/users', { method: 'POST', body: JSON.stringify(body) }),
  );
}

export function useUpdateUser(userId: string) {
  return useUserMutation((body: UserUpdateBody) =>
    apiRequest<UserCore>(`/users/${userId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  );
}

export function useLockUser() {
  // Locking cancels every session of the account, so the session counts go stale too.
  // The sessionKeys.all prefix covers the active count and the per-account lists.
  return useUserMutation(
    (userId: string) => apiRequest<void>(`/users/${userId}/lock`, { method: 'POST' }),
    [sessionKeys.all],
  );
}

export function useUnlockUser() {
  return useUserMutation((userId: string) =>
    apiRequest<void>(`/users/${userId}/unlock`, { method: 'POST' }),
  );
}

/** Soft delete: the account is hidden and can no longer sign in. Never your own account. */
export function useDeleteUser() {
  return useUserMutation(
    (userId: string) => apiRequest<void>(`/users/${userId}`, { method: 'DELETE' }),
    [sessionKeys.all],
  );
}

/** On your own row the backend keeps the calling session and revokes the others (N37). */
export function useRevokeUserSessions() {
  return useUserMutation(
    (userId: string) => apiRequest<void>(`/users/${userId}/revoke-sessions`, { method: 'POST' }),
    [sessionKeys.all],
  );
}

export function useBulkRevokeSessions() {
  return useUserMutation(
    (ids: readonly string[]) =>
      apiRequest<void>('/users/bulk-revoke-sessions', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      }),
    [sessionKeys.all],
  );
}
