'use client';

import { useQuery } from '@tanstack/react-query';

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
