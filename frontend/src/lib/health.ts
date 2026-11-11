'use client';

import { useQuery } from '@tanstack/react-query';

import { apiRequest } from './api-client';

export const healthKeys = { all: ['health'] as const };

/** `GET /health` (no sign-in needed): 204 while Backend API is up. S01 shows the dispatcher
 * pill from it (decision D6-B); it carries no state, version or node name. */
export function useHealth() {
  return useQuery({
    queryKey: healthKeys.all,
    queryFn: async () => {
      await apiRequest<void>('/health');
      return true;
    },
    retry: false,
    refetchInterval: 30_000,
  });
}
