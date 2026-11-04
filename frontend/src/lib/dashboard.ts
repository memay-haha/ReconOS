'use client';

import { useQuery } from '@tanstack/react-query';

import { apiRequest } from './api-client';
import type { JobStatus } from './jobs';
import type { FindingCounts } from './programs';

/** `GET /dashboard/summary`: docs/api/architecture.md. Counts cover only the programs the
 * account can see. */
export interface DashboardSummary {
  readonly programs: number;
  readonly assets: {
    readonly domain: number;
    readonly ip: number;
    readonly url: number;
    readonly service: number;
  };
  readonly findings_by_severity: FindingCounts;
  readonly jobs_by_status: Readonly<Record<JobStatus, number>>;
}

export const dashboardKeys = {
  summary: ['dashboard', 'summary'] as const,
};

export function useDashboardSummary() {
  return useQuery({
    queryKey: dashboardKeys.summary,
    queryFn: () => apiRequest<DashboardSummary>('/dashboard/summary'),
  });
}
