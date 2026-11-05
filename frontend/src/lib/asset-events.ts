'use client';

import { useQuery } from '@tanstack/react-query';

import { apiRequest } from './api-client';
import { type Page, type Poll, withQuery } from './page';

export type AssetType = 'domain' | 'ip' | 'url' | 'service';

export interface AssetEvent {
  readonly id: string;
  readonly program_id: string;
  readonly domain_id: string | null;
  readonly ip_id: string | null;
  readonly url_id: string | null;
  readonly service_id: string | null;
  readonly event_type: 'discovered' | 'changed';
  readonly job_id: string | null;
  readonly raw_output_id: string | null;
  /** Changed columns with old and new values. Untrusted text: render as text. */
  readonly diff: Readonly<Record<string, unknown>> | null;
  readonly created_at: string;
  // Computed on read: docs/api/architecture.md.
  readonly asset_type: AssetType;
  readonly asset_name: string;
  readonly program_name: string;
}

export interface AssetEventFilter {
  readonly programId?: string | null;
  readonly domainId?: string | null;
  readonly limit?: number | null;
}

export const assetEventKeys = {
  all: ['asset-events'] as const,
  list: (filter: AssetEventFilter, cursor: string | null) =>
    [
      'asset-events',
      'list',
      filter.programId ?? null,
      filter.domainId ?? null,
      filter.limit ?? null,
      cursor,
    ] as const,
};

export function useAssetEvents(
  filter: AssetEventFilter = {},
  cursor: string | null = null,
  poll: Poll = {},
) {
  return useQuery({
    ...poll,
    queryKey: assetEventKeys.list(filter, cursor),
    queryFn: () =>
      apiRequest<Page<AssetEvent>>(
        withQuery('/asset-events', {
          program_id: filter.programId,
          domain_id: filter.domainId,
          sort: '-created_at',
          limit: filter.limit,
          cursor,
        }),
      ),
  });
}
