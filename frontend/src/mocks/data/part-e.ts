import type { Engine, EngineVariable } from '@/lib/engines';
import type { Finding } from '@/lib/findings';
import type { AppLog } from '@/lib/logs';
import type { SystemHealth, SystemSetting } from '@/lib/system';

import { programs } from './programs';

/** Sample data uses documentation domains and addresses only: .claude/rules/testing.md. */

export function systemHealth(): SystemHealth {
  const checked = new Date().toISOString();
  const row = (name: string, status: 'ok' | 'degraded' | 'down', latency: number | null) => ({
    name,
    status,
    latency_ms: latency,
    checked_at: checked,
  });
  return {
    components: [
      row('api', 'ok', 4),
      row('dispatcher', 'ok', 12),
      row('background', 'ok', 9),
      row('beat', 'ok', 7),
      row('postgres', 'ok', 2),
      row('reconos_log', 'ok', 3),
      row('redis', 'ok', 1),
      row('minio', 'ok', 6),
      row('osmedeus', 'ok', 88),
      row('vigolium', 'degraded', 420),
    ],
    queue_length: 14,
    workers_online: 1,
  };
}

/** Keys and defaults from docs/ops/configuration.md, section on operating thresholds. */
export const systemSettings: SystemSetting[] = [
  ['session_idle_timeout_minutes', 30],
  ['session_absolute_timeout_hours', 12],
  ['login_max_failures_per_account', 5],
  ['login_max_failures_per_ip', 20],
  ['login_failure_window_minutes', 15],
  ['dispatcher_poll_seconds', 30],
  ['job_heartbeat_seconds', 30],
  ['job_heartbeat_timeout_minutes', 5],
  ['upload_max_bytes', 10_737_418_240],
  ['parser_batch_size', 1000],
  ['log_retention_days', 30],
].map(([key, value]) => ({
  key: key as string,
  value,
  updated_by: null,
  updated_at: '2026-11-01T00:00:00Z',
}));

export const appLogs: AppLog[] = [
  {
    id: '0190e000-0000-7000-8000-000000000001',
    logged_at: '2026-11-05T02:10:00Z',
    level: 'info',
    service: 'api',
    event: 'job_created',
    request_id: '0190e100-0000-7000-8000-000000000001',
    job_id: '0190e200-0000-7000-8000-000000000001',
    program_id: programs[0]?.id ?? null,
    worker_id: null,
    context: { target_count: 3 },
  },
  {
    id: '0190e000-0000-7000-8000-000000000002',
    logged_at: '2026-11-05T02:05:00Z',
    level: 'warning',
    service: 'dispatcher',
    event: 'job_heartbeat_late',
    request_id: null,
    job_id: '0190e200-0000-7000-8000-000000000002',
    program_id: programs[0]?.id ?? null,
    worker_id: null,
    context: { late_seconds: 95 },
  },
  {
    id: '0190e000-0000-7000-8000-000000000003',
    logged_at: '2026-11-04T23:40:00Z',
    level: 'error',
    service: 'background',
    event: 'parse_failed',
    request_id: null,
    job_id: '0190e200-0000-7000-8000-000000000003',
    program_id: programs[1]?.id ?? null,
    worker_id: null,
    context: { tool_module: 'nuclei', line: 41 },
  },
];

export const engines: Engine[] = [
  {
    id: '0190f000-0000-7000-8000-000000000001',
    name: 'osmedeus',
    base_url: 'https://osmedeus.example.com:8002',
    is_enabled: true,
    settings: {},
    updated_by: null,
    updated_at: '2026-11-02T03:00:00Z',
  },
  {
    id: '0190f000-0000-7000-8000-000000000002',
    name: 'vigolium',
    base_url: 'https://vigolium.example.com:9002',
    is_enabled: true,
    settings: {},
    updated_by: null,
    updated_at: '2026-11-02T03:00:00Z',
  },
];

export const engineVariables: EngineVariable[] = ['GITHUB_TOKEN', 'SHODAN_API_KEY'].map(
  (key, i) => ({
    id: `0190f100-0000-7000-8000-00000000000${i + 1}`,
    engine_id: '0190f000-0000-7000-8000-000000000001',
    key,
    updated_by: null,
    updated_at: '2026-11-03T08:00:00Z',
  }),
);

function finding(
  n: number,
  name: string,
  severity: Finding['severity'],
  triage: Finding['triage_status'],
  matchedAt: string,
): Finding {
  return {
    id: `0190d000-0000-7000-8000-00000000000${n}`,
    program_id: programs[n % 2]?.id ?? '',
    job_id: `0190e200-0000-7000-8000-00000000000${n}`,
    raw_output_id: `0190e300-0000-7000-8000-00000000000${n}`,
    domain_id: null,
    ip_id: null,
    url_id: `0190e400-0000-7000-8000-00000000000${n}`,
    service_id: null,
    name,
    template_id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    severity,
    matched_at: matchedAt,
    evidence: `HTTP/1.1 200 OK\nContent-Type: application/json\n\n{"sample": ${n}}`,
    cve: severity === 'critical' ? ['CVE-2024-0001'] : [],
    detail: null,
    triage_status: triage,
    duplicate_of_id: null,
    triaged_by: null,
    triaged_at: null,
    first_seen_at: '2026-11-03T04:00:00Z',
    last_seen_at: '2026-11-05T01:00:00Z',
  };
}

export const findings: Finding[] = [
  finding(1, 'Spring Boot Actuator Env Exposure', 'critical', 'new', 'https://api.example.com/env'),
  finding(2, 'Exposed Git Directory', 'high', 'confirmed', 'https://dev.example.com/.git/HEAD'),
  finding(3, 'Open Redirect', 'medium', 'new', 'https://auth.example.org/login?next='),
  finding(4, 'Missing Security Headers', 'low', 'reported', 'https://www.example.com/'),
  finding(5, 'Technology Detected: nginx', 'info', 'false_positive', 'https://cdn.example.com/'),
];
