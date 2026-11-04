'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from './api-client';
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
}

export interface UserPage {
  readonly items: readonly UserRow[];
  readonly next_cursor: string | null;
  readonly total: number;
  readonly total_is_estimate: boolean;
}

export const userKeys = {
  all: ['users'] as const,
  page: (cursor: string | null) => ['users', 'page', cursor] as const,
};

function withCursor(path: string, cursor: string | null): string {
  return cursor === null ? path : `${path}?cursor=${encodeURIComponent(cursor)}`;
}

export function useUsers(cursor: string | null) {
  return useQuery({
    queryKey: userKeys.page(cursor),
    queryFn: () => apiRequest<UserPage>(withCursor('/users', cursor)),
  });
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
