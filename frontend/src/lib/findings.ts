'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from './api-client';
import { type Page, type Poll, withQuery } from './page';
import type { Severity } from './programs';

export const TRIAGE_STATUSES = [
  'new',
  'confirmed',
  'false_positive',
  'duplicate',
  'reported',
  'resolved',
] as const;
export type TriageStatus = (typeof TRIAGE_STATUSES)[number];

export const TRIAGE_LABEL: Readonly<Record<TriageStatus, string>> = {
  new: 'New',
  confirmed: 'Confirmed',
  false_positive: 'False positive',
  duplicate: 'Duplicate',
  reported: 'Reported',
  resolved: 'Resolved',
};

export const SEVERITY_LABEL: Readonly<Record<Severity, string>> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  info: 'Info',
};

export interface Finding {
  readonly id: string;
  readonly program_id: string;
  readonly job_id: string;
  readonly raw_output_id: string;
  readonly domain_id: string | null;
  readonly ip_id: string | null;
  readonly url_id: string | null;
  readonly service_id: string | null;
  readonly name: string;
  readonly template_id: string | null;
  readonly severity: Severity;
  readonly matched_at: string | null;
  /** Untrusted text from the target: render as text, never as HTML. */
  readonly evidence: string | null;
  readonly cve: readonly string[];
  readonly detail: Readonly<Record<string, unknown>> | null;
  readonly triage_status: TriageStatus;
  readonly duplicate_of_id: string | null;
  readonly triaged_by: string | null;
  readonly triaged_at: string | null;
  readonly first_seen_at: string;
  readonly last_seen_at: string;
}

export interface FindingFilter {
  readonly programId?: string | null;
  readonly domainId?: string | null;
  readonly severity?: readonly Severity[] | null;
  readonly triageStatus?: TriageStatus | null;
  readonly sort?: string | null;
  readonly limit?: number | null;
}

export const findingKeys = {
  all: ['findings'] as const,
  list: (filter: FindingFilter, cursor: string | null) =>
    [
      'findings',
      'list',
      filter.programId ?? null,
      filter.domainId ?? null,
      filter.severity?.join(',') ?? null,
      filter.triageStatus ?? null,
      filter.sort ?? null,
      filter.limit ?? null,
      cursor,
    ] as const,
};

export function useFindings(
  filter: FindingFilter = {},
  cursor: string | null = null,
  poll: Poll = {},
) {
  return useQuery({
    ...poll,
    queryKey: findingKeys.list(filter, cursor),
    queryFn: () =>
      apiRequest<Page<Finding>>(
        withQuery('/findings', {
          program_id: filter.programId,
          domain_id: filter.domainId,
          severity: filter.severity ?? undefined,
          triage_status: filter.triageStatus,
          sort: filter.sort,
          limit: filter.limit,
          cursor,
        }),
      ),
  });
}

export const findingDetailKey = (findingId: string) => ['findings', 'detail', findingId] as const;

export function useFinding(findingId: string | null) {
  return useQuery({
    queryKey: findingDetailKey(findingId ?? ''),
    queryFn: () => apiRequest<Finding>(`/findings/${findingId ?? ''}`),
    enabled: findingId !== null,
  });
}

export interface FindingTriageBody {
  readonly triage_status: TriageStatus;
  /** Required by the backend when `triage_status` is `duplicate`, null otherwise. */
  readonly duplicate_of_id?: string | null;
}

export function usePatchFinding() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ findingId, body }: { findingId: string; body: FindingTriageBody }) =>
      apiRequest<Finding>(`/findings/${findingId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: findingKeys.all }),
  });
}

/** docs/api/architecture.md: a bulk call takes at most 500 IDs, and either all change or none. */
export const BULK_TRIAGE_MAX = 500;

export function useBulkTriage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { readonly ids: readonly string[]; readonly triage_status: TriageStatus }) =>
      apiRequest<void>('/findings/bulk-triage', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => client.invalidateQueries({ queryKey: findingKeys.all }),
  });
}

export const EXPORT_FORMATS = ['csv', 'jsonl', 'md'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** The browser downloads the stream itself, so this is a URL for a link, not a query. It takes
 * the same filters as the list: docs/api/architecture.md. */
export function findingExportHref(filter: FindingFilter, format: ExportFormat): string {
  return `/api/v1${withQuery('/findings/export', {
    format,
    program_id: filter.programId,
    domain_id: filter.domainId,
    severity: filter.severity ?? undefined,
    triage_status: filter.triageStatus,
  })}`;
}
