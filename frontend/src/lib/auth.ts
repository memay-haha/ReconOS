'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from './api-client';

export interface CurrentUser {
  readonly id: string;
  readonly username: string;
  readonly display_name: string;
  readonly role: 'superadmin' | 'admin' | 'user';
}

export const authKeys = { me: ['auth', 'me'] as const };

export function useMe() {
  return useQuery({ queryKey: authKeys.me, queryFn: () => apiRequest<CurrentUser>('/auth/me') });
}

export function useLogin() {
  const client = useQueryClient();
  return useMutation({
    // Credentials are only the mutation argument, never part of a query key. React Query keeps
    // mutation variables in the mutation cache until gcTime; 0 drops them once the call settles.
    gcTime: 0,
    mutationFn: (body: { username: string; password: string }) =>
      apiRequest<void>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => client.invalidateQueries({ queryKey: authKeys.me }),
  });
}

export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest<void>('/auth/logout', { method: 'POST' }),
    // Nothing in the cache belongs to the account that just left.
    onSuccess: () => client.clear(),
  });
}

export interface PasswordChangeBody {
  readonly current_password: string;
  readonly new_password: string;
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: PasswordChangeBody) =>
      apiRequest<void>('/auth/password', { method: 'POST', body: JSON.stringify(body) }),
    // The variables carry two passwords; drop them as soon as the call settles.
    gcTime: 0,
  });
}
