'use client';

import { useQuery } from '@tanstack/react-query';

import { apiRequest } from './api-client';
import type { AssetEvent } from './asset-events';
import type { Job } from './jobs';
import { type Page, withQuery } from './page';

/** A row of `GET /screenshots`, the columns of table `screenshot`. `title`, `final_url`
 * and the headers come from the target: render them as text. */
export interface Screenshot {
  readonly id: string;
  readonly program_id: string;
  readonly url_id: string | null;
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
  /** Viewport of the capture (D1); absent from sources written before it. */
  readonly width?: number | null;
  readonly height?: number | null;
}

/** Each key starts with its resource, so invalidating `['screenshots']`, `['jobs']` or
 * `['asset-events']` from another screen refreshes these too. */
export const domainDetailListKeys = {
  screenshots: (domainId: string, cursor: string | null) =>
    ['screenshots', 'by-domain', domainId, cursor] as const,
  jobs: (target: string, cursor: string | null) => ['jobs', 'by-target', target, cursor] as const,
  job: (jobId: string) => ['jobs', 'detail', jobId] as const,
  discovery: (domainId: string) => ['asset-events', 'discovery', domainId] as const,
};

export function useDomainScreenshots(domainId: string, cursor: string | null = null) {
  return useQuery({
    queryKey: domainDetailListKeys.screenshots(domainId, cursor),
    queryFn: () =>
      apiRequest<Page<Screenshot>>(
        withQuery('/screenshots', { domain_id: domainId, sort: '-captured_at', limit: 25, cursor }),
      ),
  });
}

/** Scan history of one asset: `GET /jobs?target=` returns the jobs that list it as a target. */
export function useJobsForTarget(target: string | null, cursor: string | null = null) {
  return useQuery({
    queryKey: domainDetailListKeys.jobs(target ?? '', cursor),
    enabled: target !== null,
    queryFn: () =>
      apiRequest<Page<Job>>(withQuery('/jobs', { target, sort: '-created_at', limit: 25, cursor })),
  });
}

export function useJob(jobId: string | null) {
  return useQuery({
    queryKey: domainDetailListKeys.job(jobId ?? ''),
    enabled: jobId !== null,
    queryFn: () => apiRequest<Job>(`/jobs/${encodeURIComponent(jobId ?? '')}`),
  });
}

/** The oldest event of a domain, when it is the `discovered` one. Events list newest first,
 * so that event may sit many pages away; asking for the single oldest finds it at once. */
export function useDiscoveryEvent(domainId: string) {
  return useQuery({
    queryKey: domainDetailListKeys.discovery(domainId),
    queryFn: async () => {
      const result = await apiRequest<Page<AssetEvent>>(
        withQuery('/asset-events', { domain_id: domainId, sort: 'created_at', limit: 1 }),
      );
      const first = result.items[0];
      return first !== undefined && first.event_type === 'discovered' ? first : null;
    },
  });
}
