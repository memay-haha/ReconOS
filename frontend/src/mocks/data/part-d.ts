import type { AssetEvent } from '@/lib/asset-events';
import type { DashboardSummary } from '@/lib/dashboard';
import type { UrlDetail } from '@/lib/url-detail';

import { programs } from './programs';

/** Sample data uses documentation domains and addresses only: .claude/rules/testing.md. */
const PROGRAM_ID = programs[0]?.id ?? '0190a000-0000-7000-8000-000000000001';

// New assets per day, oldest first; today last. Shaped like the mockup's three curves.
const DAILY_DOMAIN = [3, 2, 4, 3, 6, 5, 9, 7, 4, 8, 12, 9, 16, 11];
const DAILY_URL = [8, 6, 9, 12, 10, 18, 14, 9, 20, 26, 15, 31, 22, 27];
const DAILY_IP = [1, 1, 0, 2, 1, 2, 1, 3, 2, 2, 4, 3, 5, 4];

function dayOffset(days: number): string {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() - days);
  return day.toISOString().slice(0, 10);
}

export const dashboardSummary: DashboardSummary = {
  programs: programs.length,
  programs_active: programs.filter((p) => p.status === 'active').length,
  active_sync_ratio: 1,
  programs_new: 1,
  assets: { domain: 144, ip: 45, url: 332, service: 81 },
  assets_new: { domain: 11, ip: 4, url: 27, service: 3 },
  new_assets_daily: DAILY_DOMAIN.map((domain, i) => ({
    date: dayOffset(DAILY_DOMAIN.length - 1 - i),
    domain,
    url: DAILY_URL[i] ?? 0,
    ip: DAILY_IP[i] ?? 0,
  })),
  top_programs: programs
    .map((p) => ({ id: p.id, name: p.name, domain_count: p.domain_count }))
    .sort((x, y) => y.domain_count - x.domain_count)
    .slice(0, 5),
  scope_coverage: 0.972,
  top_ports: [
    { port: 443, transport: 'tcp', name: 'https', count: 38 },
    { port: 80, transport: 'tcp', name: 'http', count: 24 },
    { port: 8443, transport: 'tcp', name: 'https-alt', count: 9 },
    { port: 8080, transport: 'tcp', name: 'http-proxy', count: 6 },
    { port: 22, transport: 'tcp', name: 'ssh', count: 4 },
  ],
  top_service_name: { name: 'https', ratio: 0.58 },
  findings_by_severity: { critical: 1, high: 3, medium: 5, low: 2, info: 8 },
  confirmed_cve_findings_24h: 1,
  jobs_per_minute: 2.4,
  workers_online: 2,
  jobs_by_status: {
    pending_approval: 2,
    queued: 12,
    dispatched: 1,
    running: 3,
    completed: 1204,
    failed: 7,
    cancelled: 4,
  },
};

function uuid(prefix: string, n: number): string {
  return `${prefix}-0000-7000-8000-${String(n).padStart(12, '0')}`;
}

const HOSTS = [
  'auth.example.com',
  'api.example.com',
  'admin.example.org',
  'legacy.example.test',
  'billing.example.com',
  'git.example.org',
  'status.example.com',
  'docs.example.org',
];

export const urlDetails: readonly UrlDetail[] = HOSTS.map((host, i) => ({
  id: uuid('0190d100', i + 1),
  program_id: PROGRAM_ID,
  domain_id: uuid('0190d000', i + 1),
  ip_id: null,
  url: `https://${host}/`,
  scheme: 'https',
  host,
  port: 443,
  path: '/',
  status_code: i === 2 ? 403 : 200,
  title: `${host} home`,
  content_length: 42_800 + i * 1_024,
  content_type: 'text/html; charset=UTF-8',
  webserver: 'nginx',
  in_scope: true,
  first_seen_at: '2026-10-20T03:00:00Z',
  last_seen_at: '2026-11-04T09:00:00Z',
  technologies: [
    {
      technology_id: uuid('0190d200', 1),
      name: 'Nginx',
      category: 'web server',
      version: '1.24.0',
    },
    { technology_id: uuid('0190d200', 2), name: 'React', category: 'framework', version: null },
    { technology_id: uuid('0190d200', 3), name: 'Cloudflare', category: 'CDN', version: null },
  ],
}));

export const assetEvents: readonly AssetEvent[] = HOSTS.slice(0, 6).map((host, i) => ({
  id: uuid('0190d600', i + 1),
  program_id: PROGRAM_ID,
  domain_id: uuid('0190d000', i + 1),
  ip_id: null,
  url_id: null,
  service_id: null,
  event_type: i % 3 === 2 ? 'changed' : 'discovered',
  job_id: uuid('0190d400', 1),
  raw_output_id: uuid('0190d500', 1),
  diff: i % 3 === 2 ? { dns_status: { old: 'resolved', new: 'unresolved' } } : null,
  created_at: `2026-11-04T0${String(9 - i)}:30:00Z`,
  asset_type: 'domain',
  asset_name: host,
  program_name: programs[0]?.name ?? 'Example Corp',
}));
