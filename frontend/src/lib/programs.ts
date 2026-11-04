'use client';

import { useQuery } from '@tanstack/react-query';

import { apiRequest } from './api-client';
import { type Page, withQuery } from './page';

export const PROGRAM_STATUSES = ['active', 'paused', 'archived'] as const;
export type ProgramStatus = (typeof PROGRAM_STATUSES)[number];

export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;
export type Severity = (typeof SEVERITIES)[number];

/** Findings per severity, excluding false_positive, duplicate and resolved:
 * docs/api/architecture.md, section on computed fields. */
export type FindingCounts = Readonly<Record<Severity, number>>;

export interface Program {
  readonly id: string;
  readonly name: string;
  readonly platform: string | null;
  readonly platform_url: string | null;
  readonly bounty_type: 'bounty' | 'vdp';
  readonly description: string | null;
  readonly status: ProgramStatus;
  readonly created_by: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly archived_at: string | null;
}

/** A row of `GET /programs` or `GET /programs/{id}`. The counts are computed on read, so a
 * write answers a plain `Program`: refetch instead of copying it into this row. */
export interface ProgramRow extends Program {
  readonly in_scope_rule_count: number;
  readonly out_of_scope_rule_count: number;
  readonly domain_count: number;
  readonly ip_count: number;
  readonly url_count: number;
  readonly service_count: number;
  readonly finding_counts: FindingCounts;
}

export interface ProgramFilter {
  /** `archived` is not a list filter: archived programs leave the list. */
  readonly status?: Exclude<ProgramStatus, 'archived'> | null;
  readonly sort?: string | null;
  readonly limit?: number | null;
}

export const programKeys = {
  all: ['programs'] as const,
  list: (filter: ProgramFilter, cursor: string | null) =>
    [
      'programs',
      'list',
      filter.status ?? null,
      filter.sort ?? null,
      filter.limit ?? null,
      cursor,
    ] as const,
  detail: (programId: string) => ['programs', 'detail', programId] as const,
};

export function usePrograms(filter: ProgramFilter = {}, cursor: string | null = null) {
  return useQuery({
    queryKey: programKeys.list(filter, cursor),
    queryFn: () =>
      apiRequest<Page<ProgramRow>>(
        withQuery('/programs', {
          status: filter.status,
          sort: filter.sort,
          limit: filter.limit,
          cursor,
        }),
      ),
  });
}

export function useProgram(programId: string) {
  return useQuery({
    queryKey: programKeys.detail(programId),
    queryFn: () => apiRequest<ProgramRow>(`/programs/${programId}`),
  });
}
