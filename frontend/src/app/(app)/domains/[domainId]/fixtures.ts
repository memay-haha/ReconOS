import { page } from '../test-support';

/** Test data for S05, imported by tests only. Documentation domains and addresses only. */

export const DETAIL = {
  id: '0190d000-0000-7000-8000-000000000001',
  program_id: 'p1',
  name: 'auth.example.com',
  apex: 'example.com',
  is_wildcard: false,
  cname: null,
  dns_status: 'resolved',
  in_scope: true,
  first_seen_at: '2026-10-12T07:22:00Z',
  last_seen_at: '2026-11-04T01:05:00Z',
  ips: ['198.51.100.24', '198.51.100.25'],
  url_count: 14,
  service_count: 4,
  finding_counts: { critical: 1, high: 1, medium: 2, low: 0, info: 0 },
  tags: [
    { id: 'at1', tag_id: 'tg1', key: 'env', value: 'prod' },
    { id: 'at2', tag_id: 'tg2', key: 'tier', value: 'auth' },
    { id: 'at3', tag_id: 'tg3', key: 'cloud', value: 'cloudflare' },
  ],
};

export const TAGS = [
  { id: 'tg1', key: 'env', value: 'prod', created_by: null, created_at: '2026-10-01T00:00:00Z' },
  { id: 'tg4', key: 'owner', value: 'web', created_by: null, created_at: '2026-10-01T00:00:00Z' },
];

export const EVENT = {
  id: 'e1',
  program_id: 'p1',
  domain_id: DETAIL.id,
  ip_id: null,
  url_id: null,
  service_id: null,
  event_type: 'changed',
  job_id: 'j9',
  raw_output_id: null,
  diff: { dns_status: { old: 'timeout', new: 'resolved' } },
  created_at: '2026-11-04T01:05:00Z',
  asset_type: 'domain',
  asset_name: DETAIL.name,
  program_name: 'Example Corp',
};

export const DISCOVERED = {
  ...EVENT,
  id: 'e0',
  event_type: 'discovered',
  job_id: 'j1',
  diff: null,
};

export const JOB = {
  id: 'j1',
  program_id: 'p1',
  tool_module_id: 't1',
  status: 'completed',
  priority: 0,
  target: [DETAIL.name],
  params: {},
  proxy_id: null,
  schedule_id: null,
  retry_of_job_id: null,
  worker_id: null,
  created_by: null,
  approved_by: null,
  status_reason: null,
  created_at: '2026-10-12T07:00:00Z',
  approved_at: null,
  dispatched_at: null,
  started_at: null,
  last_heartbeat_at: null,
  finished_at: '2026-10-12T07:20:00Z',
};

export const FINDING = {
  id: 'f1',
  program_id: 'p1',
  job_id: 'j2',
  raw_output_id: 'r1',
  domain_id: DETAIL.id,
  ip_id: null,
  url_id: null,
  service_id: null,
  name: 'OAuth open redirect',
  template_id: null,
  severity: 'critical',
  matched_at: null,
  evidence: null,
  cve: ['CVE-2023-3824'],
  detail: null,
  triage_status: 'new',
  duplicate_of_id: null,
  triaged_by: null,
  triaged_at: null,
  first_seen_at: '2026-11-01T00:00:00Z',
  last_seen_at: '2026-11-04T00:00:00Z',
};

export const SCREENSHOT = {
  id: 's1',
  program_id: 'p1',
  url_id: 'u1',
  job_id: 'j3',
  raw_output_id: 'r2',
  final_url: 'https://auth.example.com/oauth/authorize',
  status_code: 200,
  title: 'Identity portal',
  perception_hash: null,
  http_headers: null,
  is_failed: false,
  error_message: null,
  captured_at: '2026-11-04T01:00:00Z',
};

/** Routes for a fully loaded S05. `/asset-events` answers the discovery lookup, which asks
 * for the oldest event, apart from the newest-first list. */
export function detailRoutes(): Record<string, unknown> {
  return {
    [`/api/v1/domains/${DETAIL.id}`]: DETAIL,
    '/api/v1/tags': page(TAGS),
    '/api/v1/asset-events': (path: string) =>
      path.includes('sort=created_at&') ? page([DISCOVERED]) : page([EVENT]),
    '/api/v1/jobs/j1': JOB,
    '/api/v1/jobs': page([JOB]),
    '/api/v1/findings': page([FINDING]),
    '/api/v1/screenshots': page([SCREENSHOT]),
  };
}
