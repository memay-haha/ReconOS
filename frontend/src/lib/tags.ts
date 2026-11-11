'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from './api-client';
import type { AssetType } from './asset-events';
import { domainDetailKeys } from './domains';
import { type Page, withQuery } from './page';

/** One entry of the shared tag catalogue: docs/appendix/glossary.md, Tag. */
export interface Tag {
  readonly id: string;
  readonly key: string;
  readonly value: string;
  readonly created_by: string | null;
  readonly created_at: string;
}

export interface AssetTag {
  readonly id: string;
  readonly tag_id: string;
  readonly domain_id: string | null;
  readonly ip_id: string | null;
  readonly url_id: string | null;
  readonly service_id: string | null;
  readonly created_by: string | null;
  readonly created_at: string;
}

export const tagKeys = {
  all: ['tags'] as const,
  list: (cursor: string | null) => ['tags', 'list', cursor] as const,
};

export function useTags(cursor: string | null = null) {
  return useQuery({
    queryKey: tagKeys.list(cursor),
    queryFn: () => apiRequest<Page<Tag>>(withQuery('/tags', { sort: 'key', limit: 200, cursor })),
  });
}

/** Adds a tag to the shared catalogue. The backend rejects a key and value pair that exists. */
export function useCreateTag() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { readonly key: string; readonly value: string }) =>
      apiRequest<Tag>('/tags', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => client.invalidateQueries({ queryKey: tagKeys.all }),
  });
}

/** The domain detail carries the tags, so both mutations read it again afterwards. */
export function useTagDomain() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { readonly tag_id: string; readonly domain_id: string }) =>
      apiRequest<AssetTag>('/asset-tags', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => client.invalidateQueries({ queryKey: domainDetailKeys.all }),
  });
}

export function useUntagAsset() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (assetTagId: string) =>
      apiRequest<void>(`/asset-tags/${encodeURIComponent(assetTagId)}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: domainDetailKeys.all }),
  });
}

/** One tag onto many assets of one type, all or none (N11). Lists carry no tags, so only the
 * domain detail reads them again. */
export function useBulkTagAssets() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      readonly tag_id: string;
      readonly asset_type: AssetType;
      readonly ids: readonly string[];
    }) =>
      apiRequest<void>('/asset-tags/bulk-create', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => client.invalidateQueries({ queryKey: domainDetailKeys.all }),
  });
}
