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

/** `GET /ips`, `/urls`, `/services` filter by program only: docs/api/openapi.yaml. */
export interface AssetListFilter {
  readonly programId?: string | null;
  readonly limit?: number | null;
}

export const ipKeys = {
  all: ['ips'] as const,
  list: (filter: AssetListFilter, cursor: string | null) =>
    ['ips', 'list', filter.programId ?? null, filter.limit ?? null, cursor] as const,
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
        withQuery('/ips', { program_id: filter.programId, limit: filter.limit, cursor }),
      ),
  });
}
