import type { DashboardSummary } from '@/lib/dashboard';

/** A full `GET /dashboard/summary` body with the mockup's figures. */
export const SUMMARY: DashboardSummary = {
  programs: 24,
  programs_active: 22,
  active_sync_ratio: 1,
  programs_new: 2,
  assets: { domain: 14892, ip: 4105, url: 86410, service: 9842 },
  assets_new: { domain: 1204, ip: 88, url: 5320, service: 0 },
  assets_closed: { service: 74 },
  new_assets_daily: Array.from({ length: 14 }, (_, i) => ({
    date: `2026-10-${String(23 + i).padStart(2, '0')}`,
    domain: i === 12 ? 1480 : i === 13 ? 1204 : 300 + i,
    url: i === 13 ? 5320 : 4000,
    ip: i === 13 ? 88 : 50,
  })),
  top_programs: [
    { id: 'p1', name: 'uber-bb', domain_count: 5142 },
    { id: 'p2', name: 'shopify-vdp', domain_count: 3890 },
  ],
  scope_coverage: 0.994,
  top_ports: [
    { port: 443, transport: 'tcp', name: 'https', count: 8240 },
    { port: 22, transport: 'tcp', name: null, count: 640 },
  ],
  top_service_name: { name: 'https', ratio: 0.72 },
  findings_by_severity: { critical: 4, high: 18, medium: 42, low: 89, info: 156 },
  findings_triage_new: 12,
  confirmed_cve_findings_24h: 3,
  jobs_by_status: {
    pending_approval: 5,
    queued: 34,
    dispatched: 12,
    running: 8,
    completed: 2341,
    failed: 15,
    cancelled: 3,
  },
  jobs_per_minute: 182,
  workers_online: 6,
};
