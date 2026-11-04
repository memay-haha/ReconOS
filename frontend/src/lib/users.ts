'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from './api-client';
import type { CurrentUser } from './auth';

export interface UserRow {
  readonly id: string;
  readonly username: string;
  readonly display_name: string;
  readonly role: CurrentUser['role'];
  readonly is_locked: boolean;
  readonly created_at: string;
  readonly last_login_at: string | null;
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

function useUserMutation<TBody>(send: (body: TBody) => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({
    // A create body carries a password. gcTime 0 drops the variables once the call settles.
    gcTime: 0,
    mutationFn: send,
    onSuccess: () => client.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export function useCreateUser() {
  return useUserMutation((body: UserCreateBody) =>
    apiRequest<UserRow>('/users', { method: 'POST', body: JSON.stringify(body) }),
  );
}

export function useUpdateUser(userId: string) {
  return useUserMutation((body: UserUpdateBody) =>
    apiRequest<UserRow>(`/users/${userId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  );
}

export function useLockUser() {
  return useUserMutation((userId: string) =>
    apiRequest<void>(`/users/${userId}/lock`, { method: 'POST' }),
  );
}

export function useUnlockUser() {
  return useUserMutation((userId: string) =>
    apiRequest<void>(`/users/${userId}/unlock`, { method: 'POST' }),
  );
}
