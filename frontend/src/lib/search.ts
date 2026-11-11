'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { apiRequest } from './api-client';
import { withQuery } from './page';

/** What `GET /search` searches: docs/api/architecture.md (decision N1). */
export type SearchResultType = 'program' | 'domain' | 'url' | 'finding' | 'tool_module';

/** A row of `GET /search`. `label` can be target data (a domain, a URL): render as text. */
export interface SearchResult {
  readonly type: SearchResultType;
  readonly id: string;
  readonly label: string;
  readonly program_id: string | null;
}

export interface SearchResponse {
  readonly items: readonly SearchResult[];
}

export const searchKeys = {
  all: ['search'] as const,
  query: (q: string, limit: number) => ['search', q, limit] as const,
};

/** Global search of the topbar. Off while `q` is blank: the endpoint requires it. */
export function useGlobalSearch(q: string, limit = 10) {
  const term = q.trim();
  return useQuery({
    queryKey: searchKeys.query(term, limit),
    queryFn: () => apiRequest<SearchResponse>(withQuery('/search', { q: term, limit })),
    enabled: term !== '',
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

/** The screen a result opens. Detail screens exist for programs and domains; the rest open
 * their list screen. */
export function searchResultHref(result: SearchResult): string {
  const id = encodeURIComponent(result.id);
  switch (result.type) {
    case 'program':
      return `/programs/${id}`;
    case 'domain':
      return `/domains/${id}`;
    case 'url':
      return '/monitor?tab=urls';
    case 'finding':
      return '/findings';
    case 'tool_module':
      return '/modules';
  }
}

export const SEARCH_TYPE_LABEL: Record<SearchResultType, string> = {
  program: 'Program',
  domain: 'Domain',
  url: 'URL',
  finding: 'Finding',
  tool_module: 'Tool module',
};
