'use client';

import { useQuery } from '@tanstack/react-query';

import { apiRequest } from './api-client';
import type { AssetListFilter } from './ips';
import { type Page, withQuery } from './page';

/** A row of `GET /urls`, the columns of table `url` in docs/data/schema.md. `url` and
 * `title` come from the target: render them as text. */
export interface UrlRow {
  readonly id: string;
  readonly program_id: string;
  readonly domain_id: string | null;
  readonly ip_id: string | null;
  readonly url: string;
  readonly scheme: string;
  readonly host: string;
  readonly port: number;
  readonly path: string;
  readonly status_code: number | null;
  readonly title: string | null;
  readonly content_length: number | null;
  readonly content_type: string | null;
  readonly webserver: string | null;
  readonly favicon_hash: string | null;
  readonly in_scope: boolean;
  readonly first_seen_at: string;
  readonly last_seen_at: string;
}

export const urlKeys = {
  all: ['urls'] as const,
  list: (filter: AssetListFilter, cursor: string | null) =>
    ['urls', 'list', filter.programId ?? null, filter.limit ?? null, cursor] as const,
};

export function useUrls(
  filter: AssetListFilter = {},
  cursor: string | null = null,
  options: { readonly enabled?: boolean } = {},
) {
  return useQuery({
    enabled: options.enabled ?? true,
    queryKey: urlKeys.list(filter, cursor),
    queryFn: () =>
      apiRequest<Page<UrlRow>>(
        withQuery('/urls', { program_id: filter.programId, limit: filter.limit, cursor }),
      ),
  });
}
