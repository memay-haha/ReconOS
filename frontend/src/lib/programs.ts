'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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
  /** The program's handle on its platform, typed by hand (`uber`): N21. */
  readonly platform_handle?: string | null;
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
  // Computed on read since the Stitch pass (docs/api/architecture.md, computed fields).
  // Optional so a row from an older mock still type-checks; a screen shows "-" when absent.
  /** max(`finished_at`) of the program's `completed` jobs (M22). */
  readonly last_job_finished_at?: string | null;
  /** In-scope domains over all domains, 0 to 1; null before the first domain. */
  readonly scope_coverage?: number | null;
  /** Assets with `first_seen_at` in the last 24 hours (M1). */
  readonly assets_new_today?: { readonly domain: number; readonly url: number };
  /** IPs with at least one service (M10). */
  readonly ip_resolved_count?: number;
  /** Distinct ports across the program's services. */
  readonly service_port_count?: number;
  readonly screenshot_count?: number;
  /** Username of `created_by`, the "Maintained by" of S09 (N24). */
  readonly created_by_username?: string | null;
}

/** Sort keys `GET /programs` accepts: docs/api/openapi.yaml. */
export const PROGRAM_SORTS = [
  'name',
  '-domain_count',
  '-finding_critical_count',
  '-last_job_finished_at',
] as const;
export type ProgramSort = (typeof PROGRAM_SORTS)[number];

/** A program page plus how long the request took in the browser: the S11 footer's
 * "Latency" (M29). Measured here, never sent by the backend. */
export type ProgramPage = Page<ProgramRow> & { readonly latency_ms: number };

export interface ProgramFilter {
  /** `archived` is not a list filter: archived programs leave the list. */
  readonly status?: Exclude<ProgramStatus, 'archived'> | null;
  readonly sort?: string | null;
  readonly limit?: number | null;
  /** Substring of name, platform, platform_handle or description (N2). */
  readonly q?: string | null;
  /** false: programs without any In-Scope rule (S08 "Show empty scope", S11 No Scope). */
  readonly hasInScopeRule?: boolean | null;
  /** false: programs with no domain yet (S11 "Unmapped only", M27). */
  readonly hasDomain?: boolean | null;
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
      filter.q ?? null,
      filter.hasInScopeRule ?? null,
      filter.hasDomain ?? null,
      cursor,
    ] as const,
  detail: (programId: string) => ['programs', 'detail', programId] as const,
};

export function usePrograms(filter: ProgramFilter = {}, cursor: string | null = null) {
  return useQuery({
    queryKey: programKeys.list(filter, cursor),
    queryFn: async (): Promise<ProgramPage> => {
      const started = performance.now();
      const result = await apiRequest<Page<ProgramRow>>(
        withQuery('/programs', {
          status: filter.status,
          sort: filter.sort,
          limit: filter.limit,
          q: filter.q === '' ? undefined : filter.q,
          has_in_scope_rule: filter.hasInScopeRule,
          has_domain: filter.hasDomain,
          cursor,
        }),
      );
      return { ...result, latency_ms: Math.round(performance.now() - started) };
    },
  });
}

export function useProgram(programId: string) {
  return useQuery({
    queryKey: programKeys.detail(programId),
    queryFn: () => apiRequest<ProgramRow>(`/programs/${programId}`),
  });
}

/** Writable fields of `POST /programs` and `PATCH /programs/{id}`: docs/data/schema.md. */
export interface ProgramBody {
  readonly name: string;
  readonly platform: string | null;
  readonly platform_url: string | null;
  readonly platform_handle?: string | null;
  readonly bounty_type: Program['bounty_type'];
  readonly description: string | null;
}

/** Every program write changes the computed rows too, so all program queries refetch. */
function useProgramMutation<TArg>(send: (arg: TArg) => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: send,
    onSuccess: () => client.invalidateQueries({ queryKey: programKeys.all }),
  });
}

export function useCreateProgram() {
  return useProgramMutation((body: ProgramBody) =>
    apiRequest<Program>('/programs', { method: 'POST', body: JSON.stringify(body) }),
  );
}

export function useUpdateProgram(programId: string) {
  return useProgramMutation((body: Partial<ProgramBody>) =>
    apiRequest<Program>(`/programs/${programId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  );
}

/** pause, resume and archive are state changes the backend decides; each answers 204. */
export type ProgramAction = 'pause' | 'resume' | 'archive';

export function useProgramAction() {
  return useProgramMutation(({ programId, action }: { programId: string; action: ProgramAction }) =>
    apiRequest<void>(`/programs/${programId}/${action}`, { method: 'POST' }),
  );
}

/** Hard delete, Superadmin only: docs/security/authorization.md. */
export function useDeleteProgram() {
  return useProgramMutation((programId: string) =>
    apiRequest<void>(`/programs/${programId}`, { method: 'DELETE' }),
  );
}

/** `POST /programs/bulk-<action>`: all or nothing, at most 500 ids. delete is Superadmin
 * only and hard, as `DELETE /programs/{id}`: docs/api/architecture.md. */
export const PROGRAM_BULK_ACTIONS = ['pause', 'resume', 'archive', 'delete'] as const;
export type ProgramBulkAction = (typeof PROGRAM_BULK_ACTIONS)[number];

export function useBulkProgramAction() {
  return useProgramMutation(
    ({ action, ids }: { action: ProgramBulkAction; ids: readonly string[] }) =>
      apiRequest<void>(`/programs/bulk-${action}`, {
        method: 'POST',
        body: JSON.stringify({ ids }),
      }),
  );
}
