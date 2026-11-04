import type { AssetEvent } from '@/lib/asset-events';
import type { DashboardSummary } from '@/lib/dashboard';
import type { Screenshot } from '@/lib/screenshots';
import type { UrlDetail } from '@/lib/url-detail';

import { programs } from './programs';

/** Sample data uses documentation domains and addresses only: .claude/rules/testing.md. */
const PROGRAM_ID = programs[0]?.id ?? '0190a000-0000-7000-8000-000000000001';

export const dashboardSummary: DashboardSummary = {
  programs: programs.length,
  assets: { domain: 144, ip: 45, url: 332, service: 81 },
  findings_by_severity: { critical: 1, high: 3, medium: 5, low: 2, info: 8 },
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

export const screenshots: readonly Screenshot[] = urlDetails.map((url, i) => {
  const failed = i === 3;
  return {
    id: uuid('0190d300', i + 1),
    program_id: PROGRAM_ID,
    url_id: url.id,
    job_id: uuid('0190d400', 1),
    raw_output_id: uuid('0190d500', 1),
    final_url: url.url,
    status_code: failed ? null : url.status_code,
    title: failed ? null : url.title,
    // Two pairs of look-alikes, so sort=perception_hash has something to group.
    perception_hash: failed ? null : `p:${String(i % 3)}f0e1d2c3b4a5968`,
    http_headers: failed
      ? null
      : {
          server: 'nginx',
          'content-type': 'text/html; charset=UTF-8',
          'strict-transport-security': 'max-age=31536000; includeSubDomains',
          'x-frame-options': 'DENY',
          'x-content-type-options': 'nosniff',
        },
    is_failed: failed,
    error_message: failed ? 'net::ERR_CONNECTION_TIMED_OUT' : null,
    captured_at: `2026-11-0${String(1 + (i % 4))}T0${String(i)}:15:00Z`,
  };
});

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

/** A 1 x 1 transparent PNG: enough for the gallery to show a loaded image. */
export const PLACEHOLDER_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);
