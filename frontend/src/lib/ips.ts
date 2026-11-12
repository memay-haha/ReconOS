'use client';

import { useQuery } from '@tanstack/react-query';

import { apiRequest } from './api-client';
import { type Page, withQuery } from './page';

/** A row of `GET /ips`, the columns of table `ip` in docs/data/schema.md. */
export interface Ip {
  readonly id: string;
  readonly program_id: string;
  readonly address: string;
  readonly asn: number | null;
  readonly asn_org: string | null;
  readonly country: string | null;
  readonly is_private: boolean;
  readonly cdn_name: string | null;
  readonly ptr: string | null;
  readonly in_scope: boolean;
  readonly first_seen_at: string;
  readonly last_seen_at: string;
}

/** `GET /ips`, `/urls`, `/services` filter by program. `/urls` and `/services` also take
 * `domain_id`: docs/api/architecture.md. `/ips` ignores it. */
export interface AssetListFilter {
  readonly programId?: string | null;
  readonly domainId?: string | null;
  /** Case-insensitive substring; `*` is a wildcard on addresses (decision N2). */
  readonly q?: string | null;
  readonly limit?: number | null;
}

/** Formats of every `/<asset>/export`: docs/api/openapi.yaml. */
export type AssetExportFormat = 'csv' | 'jsonl' | 'md';

/** Link to `GET <path>/export` with the list's filters; `ids` (at most 500) narrows it to the
 * selected rows. A link, not a fetch: the browser downloads the file. */
export function assetExportHref(
  path: '/ips' | '/urls' | '/services',
  filter: AssetListFilter,
  options: { readonly format?: AssetExportFormat; readonly ids?: readonly string[] } = {},
): string {
  return `/api/v1${withQuery(`${path}/export`, {
    format: options.format ?? 'csv',
    ids: options.ids,
    program_id: filter.programId,
    domain_id: path === '/ips' ? null : filter.domainId,
    q: filter.q,
  })}`;
}

export const ipKeys = {
  all: ['ips'] as const,
  list: (filter: AssetListFilter, cursor: string | null) =>
    [
      'ips',
      'list',
      filter.programId ?? null,
      filter.q ?? null,
      filter.limit ?? null,
      cursor,
    ] as const,
};

export function useIps(
  filter: AssetListFilter = {},
  cursor: string | null = null,
  options: { readonly enabled?: boolean } = {},
) {
  return useQuery({
    enabled: options.enabled ?? true,
    queryKey: ipKeys.list(filter, cursor),
    queryFn: () =>
      apiRequest<Page<Ip>>(
        withQuery('/ips', {
          program_id: filter.programId,
          q: filter.q,
          limit: filter.limit,
          cursor,
        }),
      ),
  });
}
