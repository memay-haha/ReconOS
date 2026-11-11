import type { Job, JobStatus } from '@/lib/jobs';
import type { ProgramRow } from '@/lib/programs';
import type { Schedule } from '@/lib/schedules';
import type { ScopeRule } from '@/lib/scope-rules';
import type { Worker } from '@/lib/workers';

import { programs as basePrograms, toolModules } from './programs';
import { users } from './users';

/** Sample data for S08 to S11 after the Stitch pass (agent D). Documentation domains and IP
 * ranges only: .claude/rules/testing.md. Arrays are mutable so the dev mocks can change rows. */

const HOUR = 3_600_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const ME = users[0]?.id ?? null;
const ME_NAME = users[0]?.username ?? 'rootadmin';

const tm = (name: string) => toolModules.find((m) => m.name === name)?.id ?? '';

type Extra = Pick<
  ProgramRow,
  | 'platform_handle'
  | 'last_job_finished_at'
  | 'scope_coverage'
  | 'assets_new_today'
  | 'ip_resolved_count'
  | 'service_port_count'
  | 'screenshot_count'
  | 'created_by_username'
>;

function extra(index: number, handle: string | null, domains: number, ips: number): Extra {
  return {
    platform_handle: handle,
    last_job_finished_at: index === 5 ? null : ago((index + 1) * 0.75 * HOUR),
    scope_coverage: domains === 0 ? null : 0.9 + (index % 3) * 0.03,
    assets_new_today: { domain: (7 - index) * 2, url: (7 - index) * 9 },
    ip_resolved_count: Math.round(ips * 0.85),
    service_port_count: 6 + index * 2,
    screenshot_count: Math.round(domains / 9),
    created_by_username: index % 2 === 0 ? ME_NAME : 'ops-lead',
  };
}

function row(
  index: number,
  base: Omit<ProgramRow, 'created_by' | 'archived_at' | 'updated_at'> & {
    readonly updated_at?: string;
  },
  handle: string | null,
): ProgramRow {
  return {
    created_by: ME,
    archived_at: null,
    updated_at: base.updated_at ?? ago((index + 2) * 6 * HOUR),
    ...base,
    ...extra(index, handle, base.domain_count, base.ip_count),
  };
}

const [B1, B2] = basePrograms;

export const programs: ProgramRow[] = [
  { ...(B1 as ProgramRow), ...extra(0, 'example', B1?.domain_count ?? 0, B1?.ip_count ?? 0) },
  { ...(B2 as ProgramRow), ...extra(1, 'example-org', B2?.domain_count ?? 0, B2?.ip_count ?? 0) },
  row(
    2,
    {
      id: '0190a000-0000-7000-8000-000000000003',
      name: 'Acme Payments',
      platform: 'Bugcrowd',
      platform_url: 'https://bugcrowd.com/acme',
      bounty_type: 'bounty',
      description: 'Payment APIs, the merchant dashboard and webhook ingress endpoints.',
      status: 'active',
      created_at: '2026-10-20T02:00:00Z',
      in_scope_rule_count: 14,
      out_of_scope_rule_count: 6,
      domain_count: 1820,
      ip_count: 540,
      url_count: 9450,
      service_count: 980,
      finding_counts: { critical: 2, high: 5, medium: 12, low: 7, info: 30 },
    },
    'acme',
  ),
  row(
    3,
    {
      id: '0190a000-0000-7000-8000-000000000004',
      name: 'Globex Cloud',
      platform: 'HackerOne',
      platform_url: 'https://hackerone.com/globex',
      bounty_type: 'bounty',
      description: 'Self-hosted and cloud editions, runners and telemetry daemons.',
      status: 'active',
      created_at: '2026-11-02T02:00:00Z',
      in_scope_rule_count: 8,
      out_of_scope_rule_count: 1,
      domain_count: 2415,
      ip_count: 620,
      url_count: 14800,
      service_count: 1840,
      finding_counts: { critical: 0, high: 3, medium: 6, low: 4, info: 11 },
    },
    'globex',
  ),
  row(
    4,
    {
      id: '0190a000-0000-7000-8000-000000000005',
      name: 'Initech Fintech',
      platform: 'Intigriti',
      platform_url: 'https://app.intigriti.com/programs/initech',
      bounty_type: 'vdp',
      description: 'Sandbox environment for open-banking API integration testing.',
      status: 'active',
      created_at: '2026-11-05T02:00:00Z',
      in_scope_rule_count: 6,
      out_of_scope_rule_count: 0,
      domain_count: 982,
      ip_count: 210,
      url_count: 3420,
      service_count: 420,
      finding_counts: { critical: 0, high: 1, medium: 4, low: 2, info: 5 },
    },
    'initech',
  ),
  row(
    5,
    {
      id: '0190a000-0000-7000-8000-000000000006',
      name: 'Umbrella Labs',
      platform: 'Intigriti',
      platform_url: null,
      bounty_type: 'vdp',
      description: 'New program, scope still being written.',
      status: 'paused',
      created_at: '2026-11-10T02:00:00Z',
      in_scope_rule_count: 0,
      out_of_scope_rule_count: 0,
      domain_count: 0,
      ip_count: 0,
      url_count: 0,
      service_count: 0,
      finding_counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    },
    'umbrella',
  ),
  row(
    6,
    {
      id: '0190a000-0000-7000-8000-000000000007',
      name: 'Hooli Mobile',
      platform: 'Self-hosted',
      platform_url: null,
      bounty_type: 'bounty',
      description: 'Mobile backend APIs and the push notification gateway.',
      status: 'active',
      created_at: '2026-09-12T02:00:00Z',
      in_scope_rule_count: 4,
      out_of_scope_rule_count: 2,
      domain_count: 643,
      ip_count: 425,
      url_count: 1700,
      service_count: 302,
      finding_counts: { critical: 1, high: 4, medium: 10, low: 3, info: 8 },
    },
    null,
  ),
  row(
    7,
    {
      id: '0190a000-0000-7000-8000-000000000008',
      name: 'Stark Industries',
      platform: 'HackerOne',
      platform_url: 'https://hackerone.com/stark',
      bounty_type: 'bounty',
      description: 'Corporate web estate and the partner extranet.',
      status: 'active',
      created_at: '2026-08-01T02:00:00Z',
      in_scope_rule_count: 0,
      out_of_scope_rule_count: 0,
      domain_count: 0,
      ip_count: 0,
      url_count: 0,
      service_count: 0,
      finding_counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    },
    'stark',
  ),
];

const P = (index: number) => programs[index]?.id ?? '';

let ruleSeq = 100;
function rule(
  programIndex: number,
  scopeType: ScopeRule['scope_type'],
  ruleType: ScopeRule['rule_type'],
  value: string,
  matched: number,
  reason: string | null = null,
): ScopeRule {
  ruleSeq += 1;
  return {
    id: `0190d000-0000-7000-8000-000000000${ruleSeq}`,
    program_id: P(programIndex),
    scope_type: scopeType,
    rule_type: ruleType,
    value,
    reason,
    created_by: ME,
    created_at: ago(ruleSeq * 5 * HOUR),
    matched_domain_count: matched,
  };
}

export const scopeRules: ScopeRule[] = [
  rule(0, 'in_scope', 'wildcard', '*.example.com', 2109),
  rule(0, 'in_scope', 'wildcard', '*.api.example.com', 894),
  rule(0, 'in_scope', 'wildcard', '*.shop.example.com', 409),
  rule(0, 'in_scope', 'wildcard', '*.partners.example.com', 211),
  rule(0, 'in_scope', 'domain', 'example.com', 1),
  rule(0, 'in_scope', 'cidr', '198.51.100.0/24', 0),
  rule(0, 'in_scope', 'url', 'https://api.example.com/v2/', 1),
  rule(0, 'in_scope', 'wildcard', '*.edge.example.com', 73),
  rule(0, 'out_of_scope', 'domain', 'billing.example.com', 1, 'Third-party payment vendor'),
  rule(0, 'out_of_scope', 'wildcard', '*.vault.example.com', 4, 'Production HSM cluster'),
  rule(1, 'in_scope', 'wildcard', '*.example.org', 16),
  rule(1, 'in_scope', 'domain', 'example.org', 1),
  rule(2, 'in_scope', 'wildcard', '*.acme.example.net', 1402),
  rule(2, 'in_scope', 'wildcard', '*.pay.example.net', 418),
  rule(2, 'out_of_scope', 'domain', 'legacy.example.net', 1, 'Decommissioned'),
  rule(3, 'in_scope', 'wildcard', '*.globex.test', 2415),
  rule(4, 'in_scope', 'wildcard', '*.initech.test', 982),
  rule(6, 'in_scope', 'wildcard', '*.hooli.test', 643),
];

let scheduleSeq = 100;
function schedule(
  programIndex: number,
  module: string,
  target: string,
  everyMinutes: number,
  lastRunAgoMs: number | null,
  enabled = true,
): Schedule {
  scheduleSeq += 1;
  return {
    id: `0190e000-0000-7000-8000-000000000${scheduleSeq}`,
    program_id: P(programIndex),
    tool_module_id: tm(module),
    target: [target],
    params: {},
    interval_minutes: everyMinutes,
    is_enabled: enabled,
    created_by: ME,
    last_run_at: lastRunAgoMs === null ? null : ago(lastRunAgoMs),
    next_run_at: enabled ? ago(-everyMinutes * 60_000) : null,
    created_at: ago(30 * 24 * HOUR),
  };
}

export const schedules: Schedule[] = [
  schedule(0, 'osmedeus-domain-lite', '*.example.com', 360, 0.75 * HOUR),
  schedule(0, 'gowitness', '*.example.com', 1440, 4 * HOUR),
  schedule(0, 'nuclei', '*.api.example.com', 10080, null, false),
  schedule(2, 'osmedeus-domain-lite', '*.acme.example.net', 720, 2 * HOUR),
];

export interface MockWorker extends Worker {
  readonly tool_modules: readonly string[];
}

export const workers: MockWorker[] = [
  {
    id: '0190c000-0000-7000-8000-000000000001',
    name: 'worker-recon-01',
    tool_modules: ['osmedeus-domain-lite', 'gowitness', 'nuclei'],
    last_heartbeat_at: ago(12_000),
    created_at: '2026-10-01T00:00:00Z',
    is_online: true,
    running_job_count: 4,
    running_tool_module_ids: [tm('nuclei')],
    cpu_percent: 38,
  },
  {
    id: '0190c000-0000-7000-8000-000000000002',
    name: 'worker-recon-02',
    tool_modules: ['gowitness', 'osmedeus-general'],
    last_heartbeat_at: ago(20_000),
    created_at: '2026-10-01T00:00:00Z',
    is_online: true,
    running_job_count: 2,
    running_tool_module_ids: [tm('gowitness')],
    cpu_percent: 64,
  },
  {
    id: '0190c000-0000-7000-8000-000000000003',
    name: 'worker-exploit-01',
    tool_modules: ['sqlmap', 'dalfox'],
    last_heartbeat_at: ago(9 * HOUR),
    created_at: '2026-10-01T00:00:00Z',
    is_online: false,
    running_job_count: 0,
    running_tool_module_ids: [],
    cpu_percent: null,
  },
];

const PLAN: readonly {
  status: JobStatus;
  module: string;
  program: number;
  target: string;
  params?: Record<string, unknown>;
  reason?: string;
  ageMin: number;
  runMin?: number;
  worker?: number;
  priority?: Job['priority'];
  byMe?: boolean;
}[] = [
  {
    status: 'running',
    module: 'nuclei',
    program: 0,
    target: 'auth.example.com',
    params: { templates: 'cves' },
    ageMin: 1,
    runMin: 0.7,
    worker: 0,
  },
  {
    status: 'running',
    module: 'gowitness',
    program: 2,
    target: 'pay.acme.example.net',
    params: { mode: 'headless' },
    ageMin: 2,
    runMin: 1.2,
    worker: 1,
  },
  {
    status: 'dispatched',
    module: 'osmedeus-domain-lite',
    program: 0,
    target: 'checkout.example.com',
    ageMin: 3,
    worker: 0,
  },
  {
    status: 'queued',
    module: 'nuclei',
    program: 2,
    target: 'fleet.acme.example.net',
    params: { severity: 'critical,high' },
    ageMin: 4,
    priority: 'normal',
  },
  {
    status: 'queued',
    module: 'gowitness',
    program: 3,
    target: '*.globex.test',
    ageMin: 5,
    priority: 'high',
  },
  {
    status: 'queued',
    module: 'osmedeus-domain-lite',
    program: 1,
    target: '*.example.org',
    ageMin: 6,
    priority: 'low',
  },
  {
    status: 'pending_approval',
    module: 'sqlmap',
    program: 0,
    target: 'https://api.example.com/v2/login',
    params: { level: 2 },
    ageMin: 8,
    byMe: true,
  },
  {
    status: 'failed',
    module: 'nuclei',
    program: 6,
    target: 'push.hooli.test',
    reason: 'Tool module timed out',
    ageMin: 12,
    runMin: 0.5,
    worker: 1,
    byMe: true,
  },
  {
    status: 'failed',
    module: 'gowitness',
    program: 2,
    target: 'legacy-dev.acme.example.net',
    reason: 'Worker lost heartbeat',
    ageMin: 14,
    runMin: 3,
    worker: 0,
  },
  {
    status: 'completed',
    module: 'gowitness',
    program: 3,
    target: 'git.globex.test',
    ageMin: 18,
    runMin: 2.2,
    worker: 1,
  },
  {
    status: 'completed',
    module: 'osmedeus-domain-lite',
    program: 0,
    target: 'example.com',
    ageMin: 25,
    runMin: 4,
    worker: 0,
  },
  {
    status: 'completed',
    module: 'nuclei',
    program: 0,
    target: '*.shop.example.com',
    params: { templates: 'cve-2024-*' },
    ageMin: 45,
    runMin: 12,
    worker: 0,
  },
  {
    status: 'cancelled',
    module: 'nuclei',
    program: 1,
    target: 'b.example.org',
    reason: 'Program paused',
    ageMin: 60,
  },
  {
    status: 'completed',
    module: 'osmedeus-general',
    program: 4,
    target: '*.initech.test',
    ageMin: 120,
    runMin: 30,
    worker: 1,
  },
  {
    status: 'completed',
    module: 'gowitness',
    program: 6,
    target: '*.hooli.test',
    ageMin: 300,
    runMin: 6,
    worker: 1,
  },
  // S05 Scan History of a sample domain (`GET /jobs?target=`).
  {
    status: 'completed',
    module: 'nuclei',
    program: 0,
    target: 'fleet-telemetry.example.com',
    ageMin: 420,
    runMin: 4,
    worker: 0,
  },
  {
    status: 'failed',
    module: 'gowitness',
    program: 0,
    target: 'fleet-telemetry.example.com',
    reason: 'navigation timeout after 30s',
    ageMin: 480,
    runMin: 1,
    worker: 1,
  },
];

const workerName = (index: number | undefined) =>
  index === undefined ? null : (workers[index]?.name ?? null);

export const jobs: Job[] = PLAN.map((plan, index) => {
  const created = Date.now() - plan.ageMin * 60_000;
  const started = plan.runMin === undefined ? null : created + 20_000;
  const finished =
    started !== null && ['completed', 'failed'].includes(plan.status)
      ? started + plan.runMin! * 60_000
      : null;
  const fromSchedule = index % 4 === 2;
  return {
    id: `0190f000-0000-7000-8000-0000000084${String(95 - index).padStart(2, '0')}`,
    program_id: P(plan.program),
    tool_module_id: tm(plan.module),
    status: plan.status,
    priority: plan.priority ?? 'normal',
    target: [plan.target],
    params: plan.params ?? {},
    proxy_id: null,
    schedule_id: fromSchedule ? (schedules[0]?.id ?? null) : null,
    retry_of_job_id: null,
    worker_id: plan.worker === undefined ? null : (workers[plan.worker]?.id ?? null),
    created_by: fromSchedule ? null : plan.byMe === true ? ME : 'ops-lead-id',
    approved_by: null,
    status_reason: plan.reason ?? null,
    created_at: new Date(created).toISOString(),
    approved_at: null,
    dispatched_at: plan.worker === undefined ? null : new Date(created + 10_000).toISOString(),
    started_at: started === null ? null : new Date(started).toISOString(),
    last_heartbeat_at: null,
    finished_at: finished === null ? null : new Date(finished).toISOString(),
    created_by_username: fromSchedule ? null : plan.byMe === true ? ME_NAME : 'ops-lead',
    worker_name: workerName(plan.worker),
    tool_module_name: plan.module,
  };
});
