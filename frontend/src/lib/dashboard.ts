'use client';

import { useQuery } from '@tanstack/react-query';

import { apiRequest } from './api-client';
import type { JobStatus } from './jobs';
import { type Poll, withQuery } from './page';
import type { FindingCounts } from './programs';

export type DashboardWindow = '24h' | '7d' | '30d';

export const DASHBOARD_WINDOWS: readonly DashboardWindow[] = ['24h', '7d', '30d'];

interface AssetCounts {
  readonly domain: number;
  readonly ip: number;
  readonly url: number;
  readonly service: number;
}

/** `GET /dashboard/summary`: docs/api/architecture.md. Counts cover only the programs the
 * account can see; the backend computes every figure, the screen only draws them. */
export interface DashboardSummary {
  readonly programs: number;
  readonly programs_active: number;
  readonly programs_new: number;
  readonly assets: AssetCounts;
  readonly assets_new: AssetCounts;
  /** 14 days, oldest first; the last entry is today. */
  readonly new_assets_daily: readonly {
    readonly date: string;
    readonly domain: number;
    readonly url: number;
    readonly ip: number;
  }[];
  readonly top_programs: readonly {
    readonly id: string;
    readonly name: string;
    readonly domain_count: number;
  }[];
  /** In-Scope domains over all domains, 0 to 1. null before the first domain. */
  readonly scope_coverage: number | null;
  readonly top_ports: readonly {
    readonly port: number;
    readonly transport: 'tcp' | 'udp';
    readonly name: string | null;
    readonly count: number;
  }[];
  readonly top_service_name: { readonly name: string; readonly ratio: number } | null;
  readonly findings_by_severity: FindingCounts;
  readonly confirmed_cve_findings_24h: number;
  readonly jobs_by_status: Readonly<Record<JobStatus, number>>;
  readonly jobs_per_minute: number;
  readonly workers_online: number;
}

export const dashboardKeys = {
  all: ['dashboard'] as const,
  summary: (window: DashboardWindow) => ['dashboard', 'summary', window] as const,
};

export function useDashboardSummary(window: DashboardWindow = '24h', poll: Poll = {}) {
  return useQuery({
    ...poll,
    queryKey: dashboardKeys.summary(window),
    queryFn: () => apiRequest<DashboardSummary>(withQuery('/dashboard/summary', { window })),
  });
}
