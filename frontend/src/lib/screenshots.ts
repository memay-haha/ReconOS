'use client';

import { type QueryClient, useQuery } from '@tanstack/react-query';

import { apiRequest } from './api-client';
import { type Page, withQuery } from './page';

/** A row of `screenshot`: docs/data/schema.md. Every text field comes from the target
 * and is untrusted: render it as text, never as HTML. */
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
}

export interface ScreenshotFilter {
  readonly programId?: string | null;
  readonly domainId?: string | null;
  /** `perception_hash` puts look-alike screenshots side by side: openapi.yaml. */
  readonly sort?: string | null;
  readonly limit?: number | null;
}

export const screenshotKeys = {
  all: ['screenshots'] as const,
  lists: ['screenshots', 'list'] as const,
  list: (filter: ScreenshotFilter, cursor: string | null) =>
    [
      'screenshots',
      'list',
      filter.programId ?? null,
      filter.domainId ?? null,
      filter.sort ?? null,
      filter.limit ?? null,
      cursor,
    ] as const,
  detail: (screenshotId: string) => ['screenshots', 'detail', screenshotId] as const,
};

export function useScreenshots(filter: ScreenshotFilter = {}, cursor: string | null = null) {
  return useQuery({
    queryKey: screenshotKeys.list(filter, cursor),
    queryFn: () =>
      apiRequest<Page<Screenshot>>(
        withQuery('/screenshots', {
          program_id: filter.programId,
          domain_id: filter.domainId,
          sort: filter.sort,
          limit: filter.limit,
          cursor,
        }),
      ),
  });
}

export function useScreenshot(screenshotId: string) {
  return useQuery({
    queryKey: screenshotKeys.detail(screenshotId),
    queryFn: () => apiRequest<Screenshot>(`/screenshots/${encodeURIComponent(screenshotId)}`),
  });
}

/** The image is streamed by Backend API, never by MinIO directly: docs/api/architecture.md.
 * An `<img>` loads it with the session cookie, so it does not go through `apiRequest`; the
 * prefix matches the one in api-client.ts. */
export function screenshotImageUrl(screenshotId: string): string {
  return `/api/v1/screenshots/${encodeURIComponent(screenshotId)}/image`;
}

/** The screenshots before and after `screenshotId` in a gallery page already in the cache.
 * Opened straight from a link, no gallery page holds it, and both are null. */
export function neighboursInCache(
  client: QueryClient,
  screenshotId: string,
): { previous: string | null; next: string | null; found: boolean } {
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
      };
    }
  }
  return { previous: null, next: null, found: false };
}
