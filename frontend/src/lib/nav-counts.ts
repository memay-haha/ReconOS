'use client';

import { useQueries } from '@tanstack/react-query';

import { NAV_GROUPS } from '@/components/nav-items';

import { apiRequest } from './api-client';

const ENDPOINTS = Array.from(
  new Set(
    NAV_GROUPS.flatMap((g) => g.items.flatMap((i) => (i.badge === undefined ? [] : [i.badge]))),
  ),
);

/** The `total` of each endpoint that feeds a sidebar count. An endpoint that does not answer
 * (not built yet, or the reader may not list it) leaves its count out rather than showing 0. */
export function useNavCounts(): Record<string, number> {
  const results = useQueries({
    queries: ENDPOINTS.map((endpoint) => ({
      queryKey: ['nav-count', endpoint] as const,
      queryFn: () => apiRequest<{ total: number }>(`${endpoint}?limit=1`),
      retry: false,
      staleTime: 30_000,
    })),
  });
  const counts: Record<string, number> = {};
  ENDPOINTS.forEach((endpoint, index) => {
    const total = results[index]?.data?.total;
    if (typeof total === 'number') counts[endpoint] = total;
  });
  return counts;
}
