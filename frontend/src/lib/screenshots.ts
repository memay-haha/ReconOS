'use client';

import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError, apiRequest } from './api-client';
import type { Job, JobStatus } from './jobs';
import { type Page, withQuery } from './page';

/** HTTP status classes the gallery filters on: openapi.yaml, `GET /screenshots`. */
export const STATUS_CLASSES = ['2xx', '3xx', '4xx', '5xx'] as const;
export type StatusCodeClass = (typeof STATUS_CLASSES)[number];

/** A technology detected on the screenshot's URL, as `GET /screenshots` lists it. */
export interface ScreenshotTechnology {
  readonly name: string;
  readonly category: string | null;
}

/** A row of `screenshot`: docs/data/schema.md, with the list fields of
 * docs/api/architecture.md. Every text field comes from the target and is untrusted:
 * render it as text, never as HTML. */
export interface Screenshot {
  readonly id: string;
  readonly program_id: string;
  readonly url_id: string;
  readonly job_id: string;
  readonly raw_output_id: string;
  readonly final_url: string | null;
  readonly status_code: number | null;
  readonly title: string | null;
  readonly perception_hash: string | null;
  readonly http_headers: Readonly<Record<string, unknown>> | null;
  readonly is_failed: boolean;
  readonly error_message: string | null;
  readonly captured_at: string;
  /** Number of the look-alike group inside the current filter; `similar_count` 1 is unique. */
  readonly similar_group: number | null;
  readonly similar_count: number;
  readonly technologies: readonly ScreenshotTechnology[];
  /** Status of the gowitness job created to retake a failed screenshot, null when none. */
  readonly retry_job_status: JobStatus | null;
  readonly width: number | null;
  readonly height: number | null;
}

/** Fields the Stitch pass added to the list row (M15, D1); older sample data lacks them. */
export type ScreenshotListExtra =
  'similar_group' | 'similar_count' | 'technologies' | 'retry_job_status' | 'width' | 'height';

/** `screenshot.tls`: docs/data/schema.md. */
export interface ScreenshotTls {
  readonly protocol: string | null;
  readonly cipher: string | null;
  readonly issuer: string | null;
  readonly subject: string | null;
  readonly san: readonly string[];
  readonly not_before: string | null;
  readonly not_after: string | null;
}

/** One entry of `screenshot.network_log`. */
export interface NetworkEntry {
  readonly method: string;
  readonly url: string;
  readonly status_code: number | null;
  readonly content_type: string | null;
  readonly size_bytes: number | null;
  readonly duration_ms: number | null;
  readonly remote_ip: string | null;
}

/** One entry of `screenshot.console_log`. */
export interface ConsoleEntry {
  readonly level: string;
  readonly message: string;
  readonly at: string | null;
}

/** One entry of `screenshot.cookies`. The value is never stored nor returned (G7). */
export interface ScreenshotCookie {
  readonly name: string;
  readonly domain: string | null;
  readonly path: string | null;
  readonly expires: string | null;
  readonly secure: boolean;
  readonly http_only: boolean;
  readonly same_site: string | null;
}

/** `GET /screenshots/{screenshot_id}`: the list row plus the gowitness capture data (D1). */
export interface ScreenshotDetail extends Screenshot {
  readonly worker_name: string | null;
  readonly device_scale: number | null;
  readonly remote_ip: string | null;
  readonly duration_ms: number | null;
  readonly tls: ScreenshotTls | null;
  readonly console_log: readonly ConsoleEntry[];
  readonly cookies: readonly ScreenshotCookie[];
  readonly html_size: number | null;
  readonly html_sha256: string | null;
  /** Header name to presence, computed by the backend (M19). */
  readonly security_headers: Readonly<Record<string, boolean>>;
  readonly security_headers_passed: number;
  readonly security_headers_total: number;
}

export interface ScreenshotFilter {
  readonly programId?: string | null;
  readonly domainId?: string | null;
  /** `perception_hash` puts look-alike screenshots side by side: openapi.yaml. */
  readonly sort?: string | null;
  readonly limit?: number | null;
  /** false hides failed captures; null shows every screenshot. */
  readonly isFailed?: boolean | null;
  /** Matches `title` and `final_url`. */
  readonly q?: string | null;
  readonly technologyIds?: readonly string[];
  readonly statusCodes?: readonly StatusCodeClass[];
  /** One gowitness job: Load Scan (N15). */
  readonly jobId?: string | null;
}

/** `GET /screenshots/summary`. */
export interface ScreenshotSummary {
  readonly by_status_code: Readonly<Partial<Record<StatusCodeClass, number>>>;
}

function filterParams(filter: ScreenshotFilter) {
  return {
    program_id: filter.programId,
    domain_id: filter.domainId,
    is_failed: filter.isFailed,
    q: filter.q,
    technology_id: filter.technologyIds,
    job_id: filter.jobId,
  };
}

function filterKey(filter: ScreenshotFilter) {
  return [
    filter.programId ?? null,
    filter.domainId ?? null,
    filter.isFailed ?? null,
    filter.q ?? null,
    filter.technologyIds ?? [],
    filter.jobId ?? null,
  ] as const;
}

export const screenshotKeys = {
  all: ['screenshots'] as const,
  lists: ['screenshots', 'list'] as const,
  list: (filter: ScreenshotFilter, cursor: string | null) =>
    [
      'screenshots',
      'list',
      ...filterKey(filter),
      filter.statusCodes ?? [],
      filter.sort ?? null,
      filter.limit ?? null,
      cursor,
    ] as const,
  summary: (filter: ScreenshotFilter) => ['screenshots', 'summary', ...filterKey(filter)] as const,
  detail: (screenshotId: string) => ['screenshots', 'detail', screenshotId] as const,
  network: (screenshotId: string) => ['screenshots', 'network', screenshotId] as const,
  html: (screenshotId: string) => ['screenshots', 'html', screenshotId] as const,
};

export function useScreenshots(filter: ScreenshotFilter = {}, cursor: string | null = null) {
  return useQuery({
    queryKey: screenshotKeys.list(filter, cursor),
    queryFn: () =>
      apiRequest<Page<Screenshot>>(
        withQuery('/screenshots', {
          ...filterParams(filter),
          status_code: filter.statusCodes,
          sort: filter.sort,
          limit: filter.limit,
          cursor,
        }),
      ),
  });
}

/** Counts per HTTP status class for the gallery chips. Takes every filter but `status_code`,
 * so a chip keeps its count while it is toggled. */
export function useScreenshotSummary(filter: ScreenshotFilter = {}) {
  return useQuery({
    queryKey: screenshotKeys.summary(filter),
    queryFn: () =>
      apiRequest<ScreenshotSummary>(withQuery('/screenshots/summary', filterParams(filter))),
  });
}

export function useScreenshot(screenshotId: string) {
  return useQuery({
    queryKey: screenshotKeys.detail(screenshotId),
    queryFn: () => apiRequest<ScreenshotDetail>(`/screenshots/${encodeURIComponent(screenshotId)}`),
  });
}

/** `GET /screenshots/{id}/network` answers `network_log`: docs/api/architecture.md. */
export function useScreenshotNetwork(screenshotId: string) {
  return useQuery({
    queryKey: screenshotKeys.network(screenshotId),
    queryFn: async () => {
      const body = await apiRequest<
        { readonly network_log?: readonly NetworkEntry[] } | readonly NetworkEntry[]
      >(`/screenshots/${encodeURIComponent(screenshotId)}/network`);
      if (Array.isArray(body)) return body as readonly NetworkEntry[];
      return (body as { readonly network_log?: readonly NetworkEntry[] }).network_log ?? [];
    },
  });
}

/** The page HTML is `text/plain`, not JSON, so it is read as text. Shown as text only. */
async function readText(path: string): Promise<string> {
  const response = await fetch(`/api/v1${path}`, { credentials: 'same-origin' });
  if (!response.ok) {
    throw new ApiError(response.status, {}, response.headers.get('retry-after'));
  }
  return response.text();
}

export function useScreenshotHtml(screenshotId: string, enabled: boolean) {
  return useQuery({
    queryKey: screenshotKeys.html(screenshotId),
    queryFn: () => readText(`/screenshots/${encodeURIComponent(screenshotId)}/html`),
    enabled,
  });
}

/** Soft delete: the raw output stays (G8). Superadmin and Admin only: authorization.md. */
export function useDeleteScreenshot() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (screenshotId: string) =>
      apiRequest<void>(`/screenshots/${encodeURIComponent(screenshotId)}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: screenshotKeys.all }),
  });
}

/** gowitness jobs for the gallery: the queued cards (N16) and the Load Scan list (N15).
 * Keyed under `jobs` so creating or changing a job refreshes them. */
export interface ScreenshotJobFilter {
  readonly toolModuleId: string | null;
  readonly statuses: readonly JobStatus[];
  readonly programId?: string | null;
  readonly limit?: number;
}

export function useScreenshotJobs(filter: ScreenshotJobFilter) {
  return useQuery({
    queryKey: [
      'jobs',
      'screenshots',
      filter.toolModuleId,
      filter.statuses,
      filter.programId ?? null,
      filter.limit ?? null,
    ] as const,
    queryFn: () =>
      apiRequest<Page<Job>>(
        withQuery('/jobs', {
          tool_module_id: filter.toolModuleId,
          status: filter.statuses,
          program_id: filter.programId,
          sort: '-created_at',
          limit: filter.limit,
        }),
      ),
    enabled: filter.toolModuleId !== null,
  });
}

/** The image is streamed by Backend API, never by MinIO directly: docs/api/architecture.md.
 * An `<img>` loads it with the session cookie, so it does not go through `apiRequest`; the
 * prefix matches the one in api-client.ts. */
export function screenshotImageUrl(screenshotId: string): string {
  return `/api/v1/screenshots/${encodeURIComponent(screenshotId)}/image`;
}

/** HAR 1.2 built from `network_log`, answered as an attachment. */
export function screenshotHarUrl(screenshotId: string): string {
  return `/api/v1/screenshots/${encodeURIComponent(screenshotId)}/har`;
}

/** The screenshots before and after `screenshotId` in a gallery page already in the cache.
 * Opened straight from a link, no gallery page holds it, and both are null. `index` is the
 * position inside that page and `total` the size of the whole filtered list. */
export function neighboursInCache(
  client: QueryClient,
  screenshotId: string,
): {
  previous: string | null;
  next: string | null;
  found: boolean;
  index: number;
  total: number;
} {
  for (const [, data] of client.getQueriesData<Page<Screenshot>>({
    queryKey: screenshotKeys.lists,
  })) {
    const items = data?.items ?? [];
    const at = items.findIndex((s) => s.id === screenshotId);
    if (at !== -1) {
      return {
        previous: items[at - 1]?.id ?? null,
        next: items[at + 1]?.id ?? null,
        found: true,
        index: at,
        total: data?.total ?? items.length,
      };
    }
  }
  return { previous: null, next: null, found: false, index: -1, total: 0 };
}
