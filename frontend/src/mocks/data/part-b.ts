import type { Job, JobStatus } from '@/lib/jobs';
import type { JobLogEntry } from '@/lib/job-logs';

import { programs, toolModules } from './programs';
import { users } from './users';

/** Sample data for part B screens. Documentation domains and IP ranges only:
 * .claude/rules/testing.md. Arrays are mutable so the dev mocks can add and remove rows. */

const P1 = programs[0]?.id ?? '';
const P2 = programs[1]?.id ?? '';
const tm = (index: number) => toolModules[index]?.id ?? '';
const ME = users[0]?.id ?? null;

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
    priority: 'normal',
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
