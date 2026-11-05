'use client';

import { useQuery } from '@tanstack/react-query';

import { apiRequest } from './api-client';
import type { AssetListFilter } from './ips';
import { type Page, withQuery } from './page';

/** A row of `GET /services`, the columns of table `service` in docs/data/schema.md.
 * `banner` comes from the target: render it as text. */
export interface Service {
  readonly id: string;
  readonly program_id: string;
  readonly ip_id: string;
  readonly port: number;
  readonly transport: 'tcp' | 'udp';
  readonly name: string | null;
  readonly product: string | null;
  readonly version: string | null;
  readonly banner: string | null;
  readonly in_scope: boolean;
  readonly first_seen_at: string;
  readonly last_seen_at: string;
}

export const serviceKeys = {
  all: ['services'] as const,
  list: (filter: AssetListFilter, cursor: string | null) =>
    [
      'services',
      'list',
      filter.programId ?? null,
      filter.domainId ?? null,
      filter.limit ?? null,
      cursor,
    ] as const,
};

export function useServices(
  filter: AssetListFilter = {},
  cursor: string | null = null,
  options: { readonly enabled?: boolean } = {},
) {
  return useQuery({
    enabled: options.enabled ?? true,
    queryKey: serviceKeys.list(filter, cursor),
    queryFn: () =>
      apiRequest<Page<Service>>(
        withQuery('/services', {
          program_id: filter.programId,
          domain_id: filter.domainId,
          limit: filter.limit,
          cursor,
        }),
      ),
  });
}
