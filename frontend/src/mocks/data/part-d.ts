import type { AssetEvent } from '@/lib/asset-events';
import type { UrlDetail } from '@/lib/url-detail';

import { programs } from './programs';

/** Sample data uses documentation domains and addresses only: .claude/rules/testing.md. */
const PROGRAM_ID = programs[0]?.id ?? '0190a000-0000-7000-8000-000000000001';

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
