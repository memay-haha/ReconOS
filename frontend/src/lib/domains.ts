'use client';

import { useQuery } from '@tanstack/react-query';

import { apiRequest } from './api-client';
import { type Page, withQuery } from './page';
import type { FindingCounts } from './programs';

export const DNS_STATUSES = ['unknown', 'resolved', 'nxdomain', 'timeout'] as const;
export type DnsStatus = (typeof DNS_STATUSES)[number];

export interface Domain {
  readonly id: string;
  readonly program_id: string;
  readonly name: string;
  readonly apex: string;
  readonly is_wildcard: boolean;
  readonly cname: string | null;
  readonly dns_status: DnsStatus;
  readonly in_scope: boolean;
  readonly first_seen_at: string;
  readonly last_seen_at: string;
}

/** A row of `GET /domains`. `ips` and the counts are computed on read:
 * docs/api/architecture.md, section on computed fields. */
export interface DomainRow extends Domain {
  readonly ips: readonly string[];
  readonly url_count: number;
  readonly service_count: number;
  readonly finding_counts: FindingCounts;
}

export interface DomainFilter {
  readonly programId?: string | null;
  readonly dnsStatus?: DnsStatus | null;
  readonly inScope?: boolean | null;
  readonly sort?: string | null;
  readonly limit?: number | null;
}

export const domainKeys = {
  all: ['domains'] as const,
  list: (filter: DomainFilter, cursor: string | null) =>
    [
      'domains',
      'list',
      filter.programId ?? null,
      filter.dnsStatus ?? null,
      filter.inScope ?? null,
      filter.sort ?? null,
      filter.limit ?? null,
      cursor,
    ] as const,
};

export function useDomains(
  filter: DomainFilter = {},
  cursor: string | null = null,
  options: { readonly enabled?: boolean } = {},
) {
  return useQuery({
    enabled: options.enabled ?? true,
    queryKey: domainKeys.list(filter, cursor),
    queryFn: () =>
      apiRequest<Page<DomainRow>>(
        withQuery('/domains', {
          program_id: filter.programId,
          dns_status: filter.dnsStatus,
          in_scope: filter.inScope,
          sort: filter.sort,
          limit: filter.limit,
          cursor,
        }),
      ),
  });
}

/** One tag on a domain, as `GET /domains/{domain_id}` lists it. `id` is the asset_tag row,
 * the handle `DELETE /asset-tags/{asset_tag_id}` takes; `tag_id` is the catalogue entry. */
export interface DomainTag {
  readonly id: string;
  readonly tag_id: string;
  readonly key: string;
  readonly value: string;
}

/** `GET /domains/{domain_id}`: the list row plus `tags`. */
export interface DomainDetail extends DomainRow {
  readonly tags: readonly DomainTag[];
}

export const domainDetailKeys = {
  all: ['domains', 'detail'] as const,
  detail: (domainId: string) => ['domains', 'detail', domainId] as const,
};

export function useDomain(domainId: string) {
  return useQuery({
    queryKey: domainDetailKeys.detail(domainId),
    queryFn: () => apiRequest<DomainDetail>(`/domains/${encodeURIComponent(domainId)}`),
  });
}

/** The export streams a file, so the browser downloads it through a plain link rather than
 * a query. Same filters as the list: docs/api/architecture.md. The prefix is the one
 * api-client.ts sends every request through. */
export function domainExportHref(filter: DomainFilter): string {
  return `/api/v1${withQuery('/domains/export', {
    format: 'csv',
    program_id: filter.programId,
    dns_status: filter.dnsStatus,
    in_scope: filter.inScope,
  })}`;
}
