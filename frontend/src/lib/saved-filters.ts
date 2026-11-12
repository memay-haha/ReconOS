'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from './api-client';
import { type Page, withQuery } from './page';

/** A filter preset of the calling account (N10, table `saved_filter`). `params` holds the
 * list endpoint's query parameters by name; only the owner reads or deletes it. */
export interface SavedFilter {
  readonly id: string;
  readonly screen: string;
  readonly name: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly created_at: string;
}

export interface SavedFilterCreateBody {
  readonly screen: string;
  readonly name: string;
  readonly params: Readonly<Record<string, unknown>>;
}

export const savedFilterKeys = {
  all: ['saved-filters'] as const,
  list: (screen: string) => ['saved-filters', 'list', screen] as const,
};

export function useSavedFilters(screen: string) {
  return useQuery({
    queryKey: savedFilterKeys.list(screen),
    queryFn: () =>
      apiRequest<Page<SavedFilter>>(
        withQuery('/saved-filters', { screen, sort: 'name', limit: 200 }),
      ),
  });
}

/** The backend rejects a name already used on the same screen. */
export function useCreateSavedFilter() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: SavedFilterCreateBody) =>
      apiRequest<SavedFilter>('/saved-filters', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => client.invalidateQueries({ queryKey: savedFilterKeys.all }),
  });
}

export function useDeleteSavedFilter() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (savedFilterId: string) =>
      apiRequest<void>(`/saved-filters/${encodeURIComponent(savedFilterId)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: savedFilterKeys.all }),
  });
}
