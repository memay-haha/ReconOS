/** Rows the part E tests answer with. Documentation domains and addresses only. */

export const HEALTH = {
  components: [
    { name: 'api', status: 'ok', latency_ms: 4, checked_at: '2026-11-05T01:00:00Z' },
    { name: 'redis', status: 'ok', latency_ms: 1, checked_at: '2026-11-05T01:00:00Z' },
    { name: 'vigolium', status: 'degraded', latency_ms: 1420, checked_at: '2026-11-05T01:00:00Z' },
    { name: 'osmedeus', status: 'down', latency_ms: null, checked_at: '2026-11-05T01:00:00Z' },
  ],
  queue_length: 1234,
  workers_online: 2,
};

export const TOOL = {
  name: 'nuclei',
  tool_modules: ['nuclei', 'osmedeus-general'],
  status: 'installed',
  installed: [{ worker_name: 'worker-recon-01', version: 'v3.3.5' }],
};

export const DIAGNOSTIC = {
  id: 'd1',
  status: 'failed',
  exit_code: 1,
  output: '[OK] api: responding\n[WARN] vigolium: latency high',
  created_at: '2026-11-05T01:00:00Z',
  finished_at: '2026-11-05T01:00:02Z',
};

export const WORKER = {
  id: 'w1',
  name: 'worker-recon-01',
  tool_modules: ['nuclei', 'gowitness'],
  last_heartbeat_at: '2026-11-05T01:00:00Z',
  created_at: '2026-10-01T00:00:00Z',
};

export const SETTING = {
  key: 'log_retention_days',
  value: 30,
  updated_by: null,
  updated_at: '2026-11-01T00:00:00Z',
};

export const LOG = {
  id: 'l1',
  logged_at: '2026-11-05T02:10:00Z',
  level: 'error',
  service: 'background',
  event: 'parse_failed',
  request_id: null,
  job_id: null,
  program_id: null,
  worker_id: null,
  context: { line: '<script>alert(1)</script>' },
};

export const ENGINE = {
  id: 'e1',
  name: 'osmedeus',
  base_url: 'https://osmedeus.example.com:8002',
  is_enabled: true,
  settings: {},
  updated_by: null,
  updated_at: '2026-11-02T03:00:00Z',
};

export const VIGOLIUM = {
  ...ENGINE,
  id: 'e2',
  name: 'vigolium',
  base_url: 'https://vigolium.example.com',
};

export const VARIABLE = {
  id: 'v1',
  engine_id: 'e1',
  key: 'GITHUB_TOKEN',
  updated_by: null,
  updated_at: '2026-11-03T08:00:00Z',
};

export const PROGRAM = {
  id: 'p1',
  name: 'Example Corp',
  platform: 'HackerOne',
  platform_url: null,
  bounty_type: 'bounty',
  description: null,
  status: 'active',
  created_by: null,
  created_at: '2026-10-01T02:00:00Z',
  updated_at: '2026-11-04T09:30:00Z',
  archived_at: null,
  in_scope_rule_count: 1,
  out_of_scope_rule_count: 0,
  domain_count: 1,
  ip_count: 0,
  url_count: 0,
  service_count: 0,
  finding_counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
};

export function toolModule(id: string, name: string, group: string, enabled = true) {
  return {
    id,
    name,
    group,
    is_enabled: enabled,
    default_params: {},
    max_concurrency: 2,
    rate_limit_per_minute: null,
    timeout_minutes: 120,
    updated_at: '2026-11-01T00:00:00Z',
  };
}

export function finding(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    program_id: 'p1',
    job_id: 'j1',
    raw_output_id: `raw-${id}`,
    domain_id: null,
    ip_id: null,
    url_id: null,
    service_id: null,
    name: `Finding ${id}`,
    template_id: `template-${id}`,
    severity: 'high',
    matched_at: 'https://api.example.com/env',
    evidence: '<img src=x onerror=alert(1)>',
    cve: [],
    detail: null,
    triage_status: 'new',
    duplicate_of_id: null,
    triaged_by: null,
    triaged_at: null,
    first_seen_at: '2026-11-03T04:00:00Z',
    last_seen_at: '2026-11-05T01:00:00Z',
    ...overrides,
  };
}
