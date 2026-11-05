'use client';

import { useQuery } from '@tanstack/react-query';

import { apiRequest } from './api-client';
import { type Page, withQuery } from './page';

export const PARSE_STATUSES = ['pending', 'parsed', 'failed', 'no_parser'] as const;
export type ParseStatus = (typeof PARSE_STATUSES)[number];

export const PARSE_STATUS_LABEL: Readonly<Record<ParseStatus, string>> = {
  pending: 'Pending',
  parsed: 'Parsed',
  failed: 'Failed',
  no_parser: 'No parser',
};

/** Metadata of one raw output; the file itself stays in MinIO behind Backend API. */
export interface RawOutput {
  readonly id: string;
  readonly job_id: string;
  readonly filename: string;
  readonly content_type: string;
  readonly size_bytes: number;
  readonly sha256: string;
  readonly parse_status: ParseStatus;
  readonly parse_error: string | null;
  readonly created_at: string;
  readonly parsed_at: string | null;
}

export const rawOutputKeys = {
  all: ['raw-outputs'] as const,
  byJob: (jobId: string, cursor: string | null) => ['raw-outputs', 'job', jobId, cursor] as const,
};

export function useJobRawOutputs(jobId: string, cursor: string | null = null) {
  return useQuery({
    queryKey: rawOutputKeys.byJob(jobId, cursor),
    queryFn: () => apiRequest<Page<RawOutput>>(withQuery(`/jobs/${jobId}/raw-outputs`, { cursor })),
  });
}

/** The download link. Backend API always answers `Content-Disposition: attachment`, so the
 * browser saves the file and never renders it. */
export function rawOutputContentHref(rawOutputId: string): string {
  return `/api/v1/raw-outputs/${rawOutputId}/content`;
}
