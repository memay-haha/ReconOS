'use client';

import { useQueries } from '@tanstack/react-query';

import { NAV_GROUPS, type NavBadge, badgeKey } from '@/components/nav-items';

import { apiRequest } from './api-client';

const BADGES: readonly NavBadge[] = Array.from(
  new Map(
    NAV_GROUPS.flatMap((g) => g.items.flatMap((i) => (i.badge === undefined ? [] : [i.badge]))).map(
      (b) => [badgeKey(b), b] as const,
    ),
  ).values(),
);

/** The paths read, each once: a list asks for one row since only its `total` is used. */
const PATHS = Array.from(new Set(BADGES.map((b) => b.path)));

function urlOf(path: string): string {
  const lists = BADGES.some((b) => b.path === path && b.field === 'total');
  return lists ? `${path}${path.includes('?') ? '&' : '?'}limit=1` : path;
}

/** Reads a dotted field such as `assets_new.domain`; null unless it holds a number. */
export function readCount(body: unknown, field: string): number | null {
  let value: unknown = body;
  for (const part of field.split('.')) {
    if (typeof value !== 'object' || value === null) return null;
    value = (value as Record<string, unknown>)[part];
  }
  return typeof value === 'number' ? value : null;
}

/** Each sidebar count by `badgeKey`. An endpoint that does not answer (not built yet, or the
 * reader may not list it) leaves its count out rather than showing 0. */
export function useNavCounts(): Record<string, number> {
  const results = useQueries({
    queries: PATHS.map((path) => ({
      queryKey: ['nav-count', path] as const,
      queryFn: () => apiRequest<unknown>(urlOf(path)),
      retry: false,
      staleTime: 30_000,
    })),
  });
  const counts: Record<string, number> = {};
  for (const badge of BADGES) {
    const count = readCount(results[PATHS.indexOf(badge.path)]?.data, badge.field);
    if (count !== null) counts[badgeKey(badge)] = count;
  }
  return counts;
}
