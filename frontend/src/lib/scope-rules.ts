'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from './api-client';
import { type Page, withQuery } from './page';
import { programKeys } from './programs';

export const SCOPE_TYPES = ['in_scope', 'out_of_scope'] as const;
export type ScopeType = (typeof SCOPE_TYPES)[number];

/** The four rule forms of docs/architecture/business-flow.md, section on scope checks. */
export const RULE_TYPES = ['domain', 'wildcard', 'cidr', 'url'] as const;
export type RuleType = (typeof RULE_TYPES)[number];

export const RULE_TYPE_LABEL: Readonly<Record<RuleType, string>> = {
  domain: 'Domain',
  wildcard: 'Wildcard',
  cidr: 'CIDR',
  url: 'URL',
};

export interface ScopeRule {
  readonly id: string;
  readonly program_id: string;
  readonly scope_type: ScopeType;
  readonly rule_type: RuleType;
  readonly value: string;
  /** Required for Out-of-Scope: the backend rejects a rule without it. */
  readonly reason: string | null;
  readonly created_by: string | null;
  readonly created_at: string;
  /** Domains of the program the rule matches (M28). Computed on read. */
  readonly matched_domain_count?: number;
}

export interface ScopeRuleBody {
  readonly scope_type: ScopeType;
  readonly rule_type: RuleType;
  readonly value: string;
  readonly reason: string | null;
}

export const scopeRuleKeys = {
  all: ['scope-rules'] as const,
  list: (programId: string, cursor: string | null) =>
    ['scope-rules', 'list', programId, cursor] as const,
};

export function useScopeRules(programId: string, cursor: string | null = null) {
  return useQuery({
    queryKey: scopeRuleKeys.list(programId, cursor),
    queryFn: () =>
      apiRequest<Page<ScopeRule>>(
        withQuery(`/programs/${programId}/scope-rules`, { limit: 200, cursor }),
      ),
  });
}

/** A rule changes the program's rule counts too, so both refetch. */
function useScopeRuleMutation<TArg>(send: (arg: TArg) => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: send,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: scopeRuleKeys.all }),
        client.invalidateQueries({ queryKey: programKeys.all }),
      ]);
    },
  });
}

export function useCreateScopeRule(programId: string) {
  return useScopeRuleMutation((body: ScopeRuleBody) =>
    apiRequest<ScopeRule>(`/programs/${programId}/scope-rules`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}

export function useUpdateScopeRule() {
  return useScopeRuleMutation(({ id, body }: { id: string; body: Partial<ScopeRuleBody> }) =>
    apiRequest<ScopeRule>(`/scope-rules/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  );
}

export function useDeleteScopeRule() {
  return useScopeRuleMutation((id: string) =>
    apiRequest<void>(`/scope-rules/${id}`, { method: 'DELETE' }),
  );
}

/** add_link on S09: `POST /programs/{id}/scope-rules/bulk-create` adds several rules at once,
 * all or nothing (N26). */
export function useBulkCreateScopeRules(programId: string) {
  return useScopeRuleMutation((items: readonly ScopeRuleBody[]) =>
    apiRequest<unknown>(`/programs/${programId}/scope-rules/bulk-create`, {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),
  );
}
