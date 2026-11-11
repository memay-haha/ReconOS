'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { apiRequest } from './api-client';
import { type Page, withQuery } from './page';
import type { FindingCounts } from './programs';
import { useRealtimeEvents } from './realtime';

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
  /** At least one open finding. Optional until every source sends it. */
  readonly has_findings?: boolean;
  /** ASN of the first address in `ips`. */
  readonly asn?: number | null;
  readonly asn_org?: string | null;
}

/** `dns_status` repeats for several values: "Unresolved" is `nxdomain` and `timeout` (M4). */
export interface DomainFilter {
  readonly programId?: string | null;
  readonly dnsStatus?: DnsStatus | readonly DnsStatus[] | null;
  readonly inScope?: boolean | null;
  /** Case-insensitive substring of the name; `*` is a wildcard: docs/api/architecture.md. */
  readonly q?: string | null;
  readonly hasFindings?: boolean | null;
  readonly firstSeenAtFrom?: string | null;
  readonly sort?: string | null;
  readonly limit?: number | null;
}

function dnsParam(value: DomainFilter['dnsStatus']): DnsStatus | readonly DnsStatus[] | null {
  if (value === undefined || value === null) return null;
  return typeof value === 'string' ? value : value.length === 0 ? null : value;
}

/** The query parameters shared by the list, the summary and the export. */
function filterParams(filter: DomainFilter) {
  return {
    program_id: filter.programId,
    dns_status: dnsParam(filter.dnsStatus),
    in_scope: filter.inScope,
    q: filter.q,
    has_findings: filter.hasFindings,
    first_seen_at_from: filter.firstSeenAtFrom,
  };
}

function filterKey(filter: DomainFilter) {
  const dns = dnsParam(filter.dnsStatus);
  return [
    filter.programId ?? null,
    dns === null ? null : typeof dns === 'string' ? dns : dns.join(','),
    filter.inScope ?? null,
    filter.q ?? null,
    filter.hasFindings ?? null,
    filter.firstSeenAtFrom ?? null,
  ] as const;
}

export const domainKeys = {
  all: ['domains'] as const,
  list: (filter: DomainFilter, cursor: string | null) =>
    [
      'domains',
      'list',
      ...filterKey(filter),
      filter.sort ?? null,
      filter.limit ?? null,
      cursor,
    ] as const,
  summary: (filter: DomainFilter) => ['domains', 'summary', ...filterKey(filter)] as const,
  activity: (domainId: string, cursor: string | null) =>
    ['domains', 'activity', domainId, cursor] as const,
  /** Rows of the S04 page last opened, kept so S05 can step to the neighbours. */
  nav: ['domains', 'nav'] as const,
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
          ...filterParams(filter),
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

/** One address the domain resolves to, with the DNS record that gave it. */
export interface IpRecord {
  readonly address: string;
  readonly record_type: string;
}

/** `GET /domains/{domain_id}`: the list row plus `tags`, `ip_records` and `service_ports`. */
export interface DomainDetail extends DomainRow {
  readonly tags: readonly DomainTag[];
  readonly ip_records?: readonly IpRecord[];
  /** Ports of the services on the domain's addresses, ascending. */
  readonly service_ports?: readonly number[];
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

/** `GET /domains/summary`, under the list filters: docs/api/architecture.md. */
export interface DomainSummary {
  readonly total: number;
  readonly in_scope: number;
  readonly resolved: number;
  readonly resolved_new_24h: number;
  readonly unresolved: number;
  readonly with_findings: number;
  readonly with_critical: number;
  readonly new_24h: number;
  readonly new_daily_avg_7d: number;
}

export function useDomainSummary(filter: DomainFilter = {}) {
  return useQuery({
    queryKey: domainKeys.summary(filter),
    queryFn: () => apiRequest<DomainSummary>(withQuery('/domains/summary', filterParams(filter))),
  });
}

export const EXPORT_FORMATS = ['csv', 'jsonl', 'md'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** The export streams a file, so the browser downloads it through a plain link rather than
 * a query. Same filters as the list, or only the rows in `ids` (at most 500):
 * docs/api/architecture.md. The prefix is the one api-client.ts sends every request through. */
export function domainExportHref(
  filter: DomainFilter,
  options: { readonly format?: ExportFormat; readonly ids?: readonly string[] } = {},
): string {
  return `/api/v1${withQuery('/domains/export', {
    format: options.format ?? 'csv',
    ids: options.ids,
    ...filterParams(filter),
  })}`;
}

/** Soft delete: the rows leave every list, raw outputs stay (D5). Superadmin and Admin. */
export function useDeleteDomain() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (domainId: string) =>
      apiRequest<void>(`/domains/${encodeURIComponent(domainId)}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: domainKeys.all }),
  });
}

/** All rows or none, at most 500 ids: docs/api/architecture.md, bulk actions. */
export function useBulkDeleteDomains() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (ids: readonly string[]) =>
      apiRequest<void>('/domains/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: domainKeys.all }),
  });
}

export const ACTIVITY_KINDS = ['asset_event', 'finding', 'screenshot'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** A row of `GET /domains/{domain_id}/activity`. `title` comes from the target: text only. */
export interface DomainActivity {
  readonly kind: ActivityKind;
  readonly id: string;
  readonly at: string;
  readonly title: string;
  readonly tool_module_name: string | null;
  readonly job_id: string | null;
}

/** The unified timeline, newest first (N12). Asset events refresh it through the `domains`
 * root; a new finding refreshes it here. */
export function useDomainActivity(domainId: string, cursor: string | null = null, limit = 10) {
  const client = useQueryClient();
  const onEvent = useCallback(
    (event: { readonly type: string }) => {
      if (event.type === 'finding.created')
        void client.invalidateQueries({ queryKey: ['domains', 'activity', domainId] });
    },
    [client, domainId],
  );
  useRealtimeEvents(onEvent);
  return useQuery({
    queryKey: domainKeys.activity(domainId, cursor),
    queryFn: () =>
      apiRequest<Page<DomainActivity>>(
        withQuery(`/domains/${encodeURIComponent(domainId)}/activity`, { limit, cursor }),
      ),
  });
}

/** The S04 page a reader opened a domain from: its ids in order and where the page starts. */
export interface DomainNav {
  readonly ids: readonly string[];
  /** 1-based position of `ids[0]` in the whole list. */
  readonly start: number;
  readonly total: number;
  readonly totalIsEstimate: boolean;
}

/** Kept in the query cache, never fetched: opening S05 directly finds nothing and hides the
 * stepper. */
export function useRememberDomainNav(): (nav: DomainNav) => void {
  const client = useQueryClient();
  return useCallback((nav: DomainNav) => client.setQueryData(domainKeys.nav, nav), [client]);
}

export function useDomainNav(): DomainNav | null {
  const query = useQuery({
    queryKey: domainKeys.nav,
    queryFn: () => null,
    enabled: false,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
  });
  return query.data ?? null;
}
