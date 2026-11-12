'use client';

import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError, apiRequest } from './api-client';
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

/** A row of `GET /findings`: the columns plus the computed fields of docs/api/architecture.md.
 * Every text field comes from raw output: render it as text, never as HTML. */
export interface FindingRow {
  readonly id: string;
  readonly program_id: string;
  readonly program_name: string;
  /** Null once the source job or raw output is gone. */
  readonly job_id: string | null;
  readonly raw_output_id: string | null;
  readonly tool_module_name: string | null;
  readonly dedup_key: string;
  readonly name: string;
  readonly template_id: string | null;
  readonly severity: Severity;
  readonly matched_at: string | null;
  readonly evidence: string | null;
  readonly cve: readonly string[];
  /** What the template matched on (D2). */
  readonly matcher: string | null;
  readonly asset: FindingAsset;
  readonly triage_status: TriageStatus;
  readonly duplicate_of_id: string | null;
  readonly triaged_by: string | null;
  readonly triaged_by_username: string | null;
  readonly triaged_at: string | null;
  readonly first_seen_at: string;
  readonly last_seen_at: string;
  /** Sorted by key then value. */
  readonly tags: readonly FindingTag[];
}

/** The asset a finding sits on, as `GET /findings` names it. Untrusted text from the target. */
export interface FindingAsset {
  readonly type: 'domain' | 'ip' | 'url' | 'service';
  readonly id: string;
  readonly name: string;
  readonly ip: string | null;
  readonly port: number | null;
  readonly service_name: string | null;
}

/** `GET /findings/{finding_id}`: the row plus the keys of `finding.detail` (D2) and the scope
 * state. `scope_rule` is the first In-Scope value matching the asset, `null` when none does. */
export interface FindingDetail extends FindingRow {
  readonly description: string | null;
  readonly remediation: string | null;
  readonly request: string | null;
  readonly response: string | null;
  readonly detail: Readonly<Record<string, unknown>>;
  readonly in_scope: boolean;
  readonly scope_rule: string | null;
  /** Statuses the backend lets this finding move to now, by the triage lifecycle. */
  readonly allowed_triage_statuses: readonly TriageStatus[];
}

export interface FindingTag {
  readonly tag_id: string;
  readonly key: string;
  readonly value: string;
}

/** docs/api/architecture.md: `PUT /findings/{finding_id}/tags` takes at most 100 tags. */
export const FINDING_TAGS_MAX = 100;

export interface FindingFilter {
  readonly programId?: string | null;
  readonly domainId?: string | null;
  readonly severity?: readonly Severity[] | null;
  /** Repeatable: several statuses at once, as Hide False Positives sends them. */
  readonly triageStatus?: readonly TriageStatus[] | null;
  readonly q?: string | null;
  readonly sort?: string | null;
  readonly limit?: number | null;
}

function filterQuery(filter: FindingFilter) {
  return {
    program_id: filter.programId,
    domain_id: filter.domainId,
    severity: filter.severity ?? undefined,
    triage_status: filter.triageStatus ?? undefined,
    q: filter.q,
  };
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
      filter.triageStatus?.join(',') ?? null,
      filter.q ?? null,
      filter.sort ?? null,
      filter.limit ?? null,
      cursor,
    ] as const,
  summary: (filter: FindingFilter) =>
    [
      'findings',
      'summary',
      filter.programId ?? null,
      filter.domainId ?? null,
      filter.severity?.join(',') ?? null,
      filter.triageStatus?.join(',') ?? null,
      filter.q ?? null,
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
      apiRequest<Page<FindingRow>>(
        withQuery('/findings', {
          ...filterQuery(filter),
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
    queryFn: () => apiRequest<FindingDetail>(`/findings/${findingId ?? ''}`),
    enabled: findingId !== null,
  });
}

/** `GET /findings/summary`: counts under the same filter as the list, every triage status by
 * default. `new_24h_by_severity` counts findings first seen in the last 24 hours (M40). */
export interface FindingSummary {
  readonly total: number;
  readonly by_severity: Readonly<Record<Severity, number>>;
  readonly by_triage_status: Readonly<Record<TriageStatus, number>>;
  readonly by_program: readonly {
    readonly program_id: string;
    readonly name: string;
    readonly count: number;
  }[];
  readonly new_24h_by_severity: Readonly<Record<Severity, number>>;
}

export function useFindingSummary(filter: FindingFilter = {}) {
  return useQuery({
    queryKey: findingKeys.summary(filter),
    queryFn: () => apiRequest<FindingSummary>(withQuery('/findings/summary', filterQuery(filter))),
  });
}

export interface FindingTriageBody {
  readonly triage_status: TriageStatus;
  /** Required by the backend when `triage_status` is `duplicate`, null otherwise. */
  readonly duplicate_of_id?: string | null;
}

/** A triage change moves the open counts (`finding_counts`, `has_findings`) of programs and
 * domains, the dashboard and the sidebar badge of new findings, not just the finding lists. */
const TRIAGE_ROOTS = [findingKeys.all[0], 'nav-count', 'programs', 'domains', 'dashboard'] as const;

function invalidateTriageCounts(client: QueryClient): Promise<void[]> {
  return Promise.all(TRIAGE_ROOTS.map((root) => client.invalidateQueries({ queryKey: [root] })));
}

export function usePatchFinding() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ findingId, body }: { findingId: string; body: FindingTriageBody }) =>
      apiRequest<FindingDetail>(`/findings/${findingId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => invalidateTriageCounts(client),
  });
}

/** Replaces every tag of one finding; an empty list removes them all. */
export function useSetFindingTags() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ findingId, tagIds }: { findingId: string; tagIds: readonly string[] }) =>
      apiRequest<void>(`/findings/${encodeURIComponent(findingId)}/tags`, {
        method: 'PUT',
        body: JSON.stringify({ tag_ids: tagIds }),
      }),
    onSuccess: (_data, { findingId }) =>
      client.invalidateQueries({ queryKey: findingDetailKey(findingId) }),
  });
}

/** docs/api/architecture.md: a bulk call takes at most 500 IDs, and either all change or none. */
export const BULK_TRIAGE_MAX = 500;

export function useBulkTriage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { readonly ids: readonly string[]; readonly triage_status: TriageStatus }) =>
      apiRequest<void>('/findings/bulk-triage', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => invalidateTriageCounts(client),
  });
}

export const EXPORT_FORMATS = ['csv', 'jsonl', 'md'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** The browser downloads the stream itself, so this is a URL for a link, not a query. It takes
 * the same filters as the list, or `ids` for the selected rows only: docs/api/architecture.md. */
export function findingExportHref(
  filter: FindingFilter,
  format: ExportFormat,
  ids: readonly string[] = [],
): string {
  return `/api/v1${withQuery(
    '/findings/export',
    ids.length > 0 ? { format, ids } : { format, ...filterQuery(filter) },
  )}`;
}

/** The Markdown export of the given findings, read as text: the bug report the row action and
 * the drawer copy (N51). A 401 here is left to the next query, as the export is not a query. */
async function fetchFindingMarkdown(ids: readonly string[]): Promise<string> {
  const response = await fetch(findingExportHref({}, 'md', ids), { credentials: 'same-origin' });
  if (!response.ok) {
    throw new ApiError(response.status, { code: 'export_failed' }, null);
  }
  return response.text();
}

export function useCopyFindingMarkdown() {
  return useMutation({
    mutationFn: async (ids: readonly string[]) => {
      const text = await fetchFindingMarkdown(ids);
      await navigator.clipboard.writeText(text);
    },
  });
}
