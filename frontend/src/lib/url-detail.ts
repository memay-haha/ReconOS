'use client';

import { useQuery } from '@tanstack/react-query';

import { apiRequest } from './api-client';

/** One `url_technology` row joined to its `technology`: docs/data/schema.md. */
export interface UrlTechnology {
  readonly technology_id: string;
  readonly name: string;
  readonly category: string | null;
  /** null: the version was not recognised. */
  readonly version: string | null;
}

/** `GET /urls/{url_id}`: a `url` row with the technologies detected on it. Every text field
 * comes from the target and is untrusted: render it as text. */
export interface UrlDetail {
  readonly id: string;
  readonly program_id: string;
  readonly domain_id: string | null;
  readonly ip_id: string | null;
  readonly url: string;
  readonly scheme: string;
  readonly host: string;
  readonly port: number | null;
  readonly path: string | null;
  readonly status_code: number | null;
  readonly title: string | null;
  readonly content_length: number | null;
  readonly content_type: string | null;
  readonly webserver: string | null;
  readonly in_scope: boolean;
  readonly first_seen_at: string;
  readonly last_seen_at: string;
  readonly technologies: readonly UrlTechnology[];
}

export const urlKeys = {
  all: ['urls'] as const,
  detail: (urlId: string) => ['urls', 'detail', urlId] as const,
};

export function useUrlDetail(urlId: string | null) {
  return useQuery({
    queryKey: urlKeys.detail(urlId ?? ''),
    queryFn: () => apiRequest<UrlDetail>(`/urls/${encodeURIComponent(urlId ?? '')}`),
    enabled: urlId !== null,
  });
}

/** `value` as a link target, or null. A URL from the target may be `javascript:` or
 * `data:`, so only http and https become a link; anything else stays plain text. */
export function httpHref(value: string | null | undefined): string | null {
  if (value == null) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}
