'use client';

import { useQuery } from '@tanstack/react-query';

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
