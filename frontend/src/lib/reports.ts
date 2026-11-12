'use client';

import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from './api-client';
import type { FindingRow } from './findings';
import { type Page, withQuery } from './page';
import type { Severity } from './programs';
import type { RawOutput } from './raw-outputs';

export const REPORT_STATUSES = ['draft', 'submitted'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_STATUS_LABEL: Readonly<Record<ReportStatus, string>> = {
  draft: 'Draft',
  submitted: 'Submitted',
};

/** A row of `GET /reports`: docs/api/openapi.yaml, schema Report. */
export interface ReportRow {
  readonly id: string;
  readonly program_id: string;
  readonly program_name: string;
  readonly title: string;
  readonly status: ReportStatus;
  /** The report's ID on the bug bounty platform, typed in by hand. */
  readonly platform_report_ref: string | null;
  readonly finding_count: number;
  readonly severity_counts: Readonly<Record<Severity, number>>;
  readonly created_by: string | null;
  readonly created_by_username: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly submitted_at: string | null;
}

/** A finding of the report with the raw output it came from: the evidence, metadata only. */
export interface ReportFinding extends FindingRow {
  readonly raw_output: RawOutput | null;
}

/** `GET /reports/{report_id}`. `body` is Markdown that may quote raw output: render it only
 * through `MarkdownView`, which never turns text into HTML. */
export interface ReportDetail extends ReportRow {
  readonly body: string;
  readonly findings: readonly ReportFinding[];
}

export interface ReportFilter {
  readonly programId?: string | null;
  readonly status?: ReportStatus | null;
  readonly q?: string | null;
}

export const reportKeys = {
  all: ['reports'] as const,
  list: (filter: ReportFilter, cursor: string | null) =>
    [
      'reports',
      'list',
      filter.programId ?? null,
      filter.status ?? null,
      filter.q ?? null,
      cursor,
    ] as const,
  detail: (reportId: string) => ['reports', 'detail', reportId] as const,
};

export function useReports(filter: ReportFilter = {}, cursor: string | null = null) {
  return useQuery({
    queryKey: reportKeys.list(filter, cursor),
    queryFn: () =>
      apiRequest<Page<ReportRow>>(
        withQuery('/reports', {
          program_id: filter.programId,
          status: filter.status,
          q: filter.q,
          cursor,
        }),
      ),
  });
}

export function useReport(reportId: string) {
  return useQuery({
    queryKey: reportKeys.detail(reportId),
    queryFn: () => apiRequest<ReportDetail>(`/reports/${encodeURIComponent(reportId)}`),
  });
}

export interface ReportCreateBody {
  readonly program_id: string;
  readonly title: string;
  readonly body?: string;
  readonly platform_report_ref?: string | null;
  readonly finding_ids: readonly string[];
}

export interface ReportUpdateBody {
  readonly title?: string;
  readonly body?: string;
  readonly platform_report_ref?: string | null;
  readonly finding_ids?: readonly string[];
}

/** Submitting moves findings to `reported`, which moves every count built on triage status. */
const SUBMIT_ROOTS = ['reports', 'findings', 'nav-count', 'programs', 'domains', 'dashboard'];

function invalidate(client: QueryClient, roots: readonly string[]): Promise<void[]> {
  return Promise.all(roots.map((root) => client.invalidateQueries({ queryKey: [root] })));
}

export function useCreateReport() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: ReportCreateBody) =>
      apiRequest<ReportDetail>('/reports', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => invalidate(client, ['reports']),
  });
}

export function usePatchReport(reportId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: ReportUpdateBody) =>
      apiRequest<ReportDetail>(`/reports/${encodeURIComponent(reportId)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: (report) => {
      client.setQueryData(reportKeys.detail(reportId), report);
      return invalidate(client, ['reports']);
    },
  });
}

export function useSubmitReport(reportId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (platformReportRef: string | null) =>
      apiRequest<ReportDetail>(`/reports/${encodeURIComponent(reportId)}/submit`, {
        method: 'POST',
        body: JSON.stringify({ platform_report_ref: platformReportRef }),
      }),
    onSuccess: (report) => {
      client.setQueryData(reportKeys.detail(reportId), report);
      return invalidate(client, SUBMIT_ROOTS);
    },
  });
}

export function useDeleteReport(reportId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<void>(`/reports/${encodeURIComponent(reportId)}`, { method: 'DELETE' }),
    onSuccess: () => {
      client.removeQueries({ queryKey: reportKeys.detail(reportId) });
      return invalidate(client, ['reports']);
    },
  });
}

export const REPORT_EXPORT_FORMATS = ['md', 'csv', 'jsonl'] as const;
export type ReportExportFormat = (typeof REPORT_EXPORT_FORMATS)[number];

/** The browser downloads the stream itself, so this is a URL for a link, not a query. */
export function reportExportHref(reportId: string, format: ReportExportFormat): string {
  return `/api/v1${withQuery(`/reports/${encodeURIComponent(reportId)}/export`, { format })}`;
}
