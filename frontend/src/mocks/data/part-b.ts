import type { Job, JobStatus } from '@/lib/jobs';
import type { JobLogEntry } from '@/lib/job-logs';
import type { ProgramUser } from '@/lib/program-users';
import type { Proxy } from '@/lib/proxies';
import type { RawOutput } from '@/lib/raw-outputs';
import type { Schedule } from '@/lib/schedules';
import type { ScopeRule } from '@/lib/scope-rules';

import { programs, toolModules } from './programs';
import { users } from './users';

/** Sample data for part B screens. Documentation domains and IP ranges only:
 * .claude/rules/testing.md. Arrays are mutable so the dev mocks can add and remove rows. */

const P1 = programs[0]?.id ?? '';
const P2 = programs[1]?.id ?? '';
const tm = (index: number) => toolModules[index]?.id ?? '';
const ME = users[0]?.id ?? null;

export const scopeRules: ScopeRule[] = [
  {
    id: '0190d000-0000-7000-8000-000000000001',
    program_id: P1,
    scope_type: 'in_scope',
    rule_type: 'wildcard',
    value: '*.example.com',
    reason: null,
    created_by: ME,
    created_at: '2026-10-01T03:00:00Z',
  },
  {
    id: '0190d000-0000-7000-8000-000000000002',
    program_id: P1,
    scope_type: 'in_scope',
    rule_type: 'domain',
    value: 'example.com',
    reason: null,
    created_by: ME,
    created_at: '2026-10-01T03:01:00Z',
  },
  {
    id: '0190d000-0000-7000-8000-000000000003',
    program_id: P1,
    scope_type: 'in_scope',
    rule_type: 'cidr',
    value: '198.51.100.0/24',
    reason: null,
    created_by: ME,
    created_at: '2026-10-02T03:00:00Z',
  },
  {
    id: '0190d000-0000-7000-8000-000000000004',
    program_id: P1,
    scope_type: 'in_scope',
    rule_type: 'url',
    value: 'https://api.example.com/v2/',
    reason: null,
    created_by: ME,
    created_at: '2026-10-03T03:00:00Z',
  },
  {
    id: '0190d000-0000-7000-8000-000000000005',
    program_id: P1,
    scope_type: 'out_of_scope',
    rule_type: 'domain',
    value: 'billing.example.com',
    reason: 'Third-party payment vendor',
    created_by: ME,
    created_at: '2026-10-03T04:00:00Z',
  },
  {
    id: '0190d000-0000-7000-8000-000000000006',
    program_id: P2,
    scope_type: 'in_scope',
    rule_type: 'wildcard',
    value: '*.example.org',
    reason: null,
    created_by: ME,
    created_at: '2026-10-12T03:00:00Z',
  },
];

export const schedules: Schedule[] = [
  {
    id: '0190e000-0000-7000-8000-000000000001',
    program_id: P1,
    tool_module_id: tm(0),
    target: ['example.com'],
    params: {},
    interval_minutes: 1440,
    is_enabled: true,
    created_by: ME,
    last_run_at: '2026-11-04T00:00:00Z',
    next_run_at: '2026-11-05T00:00:00Z',
    created_at: '2026-10-01T05:00:00Z',
  },
  {
    id: '0190e000-0000-7000-8000-000000000002',
    program_id: P1,
    tool_module_id: tm(3),
    target: ['*.example.com'],
    params: {},
    interval_minutes: 360,
    is_enabled: false,
    created_by: ME,
    last_run_at: null,
    next_run_at: null,
    created_at: '2026-10-05T05:00:00Z',
  },
];

export const proxies: Proxy[] = [
  {
    id: '0190f000-0000-7000-8000-000000000001',
    program_id: P1,
    name: 'egress-sg',
    is_enabled: true,
    created_at: '2026-10-01T06:00:00Z',
    updated_at: '2026-10-20T06:00:00Z',
  },
];

export const programUsers: ProgramUser[] = [
  {
    program_id: P1,
    user_id: users[2]?.id ?? '',
    assigned_by: ME,
    assigned_at: '2026-10-02T06:00:00Z',
  },
];

function job(
  n: number,
  status: JobStatus,
  toolModule: number,
  target: string,
  extra: Partial<Job> = {},
): Job {
  return {
    id: `01910000-0000-7000-8000-00000000000${n}`,
    program_id: n % 3 === 0 ? P2 : P1,
    tool_module_id: tm(toolModule),
    status,
    priority: 0,
    target: [target],
    params: {},
    proxy_id: null,
    schedule_id: null,
    retry_of_job_id: null,
    worker_id: null,
    created_by: ME,
    approved_by: null,
    status_reason: null,
    created_at: `2026-11-04T0${n}:00:00Z`,
    approved_at: null,
    dispatched_at: null,
    started_at: null,
    last_heartbeat_at: null,
    finished_at: null,
    ...extra,
  };
}

export const jobs: Job[] = [
  job(1, 'pending_approval', 5, 'https://api.example.com/v2/login'),
  job(2, 'queued', 3, 'a.example.com'),
  job(3, 'dispatched', 0, 'example.org', { created_by: null }),
  job(4, 'running', 1, 'www.example.com', { started_at: '2026-11-04T04:01:00Z' }),
  job(5, 'completed', 0, 'example.com', {
    started_at: '2026-11-04T05:00:30Z',
    finished_at: '2026-11-04T05:04:32Z',
  }),
  job(6, 'failed', 3, 'b.example.org', {
    started_at: '2026-11-04T06:00:10Z',
    finished_at: '2026-11-04T06:30:10Z',
    status_reason: 'Tool module timed out',
  }),
  job(7, 'cancelled', 3, 'billing.example.com', {
    status_reason: 'Target no longer matches the scope',
  }),
];

export const rawOutputs: RawOutput[] = [
  {
    id: '01911000-0000-7000-8000-000000000001',
    job_id: jobs[4]?.id ?? '',
    filename: 'subdomains.jsonl',
    content_type: 'application/x-ndjson',
    size_bytes: 48213,
    sha256: '0'.repeat(64),
    parse_status: 'parsed',
    parse_error: null,
    created_at: '2026-11-04T05:04:40Z',
    parsed_at: '2026-11-04T05:04:45Z',
  },
];

export const jobLogs: JobLogEntry[] = [
  {
    id: '01912000-0000-7000-8000-000000000001',
    logged_at: '2026-11-04T05:00:30Z',
    level: 'info',
    service: 'worker',
    event: 'job_started',
    job_id: jobs[4]?.id ?? null,
    context: {},
  },
  {
    id: '01912000-0000-7000-8000-000000000002',
    logged_at: '2026-11-04T05:04:32Z',
    level: 'info',
    service: 'worker',
    event: 'job_completed',
    job_id: jobs[4]?.id ?? null,
    context: { raw_outputs: 1 },
  },
];
