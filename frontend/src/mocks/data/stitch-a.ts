import type { Alert } from '@/lib/alerts';

import { programs } from './programs';

const P1 = programs[0]?.id ?? null;
const P2 = programs[1]?.id ?? null;

function uuid(prefix: string, n: number): string {
  return `${prefix}-0000-7000-8000-${String(n).padStart(12, '0')}`;
}

function ago(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

/** Sample alerts of the signed-in account; documentation domains only (testing.md). Mutable so
 * the mark-read mocks can flip `is_read`. */
type MockAlert = { -readonly [K in keyof Alert]: Alert[K] };

export const alerts: MockAlert[] = [
  {
    id: uuid('0190a700', 1),
    alert_type: 'finding_new',
    message: 'Critical finding: Spring Boot Actuator Env Exposure on api.example.com',
    program_id: P1,
    finding_id: '0190e000-0000-7000-8000-000000000001',
    job_id: null,
    created_at: ago(4),
    is_read: false,
  },
  {
    id: uuid('0190a700', 2),
    alert_type: 'cert_expiring',
    message: 'TLS certificate of https://auth.example.com expires in 6 days',
    program_id: P1,
    finding_id: null,
    job_id: null,
    created_at: ago(18),
    is_read: false,
  },
  {
    id: uuid('0190a700', 3),
    alert_type: 'job_pending_approval',
    message: 'sqlmap job on https://api.example.com/v1/items waits for approval',
    program_id: P1,
    finding_id: null,
    job_id: uuid('0190d400', 2),
    created_at: ago(42),
    is_read: false,
  },
  {
    id: uuid('0190a700', 4),
    alert_type: 'job_failed',
    message: 'naabu job on 198.51.100.0/24 failed',
    program_id: P2,
    finding_id: null,
    job_id: uuid('0190d400', 3),
    created_at: ago(95),
    is_read: true,
  },
  {
    id: uuid('0190a700', 5),
    alert_type: 'asset_new',
    message: '12 new domains in Example Org VDP',
    program_id: P2,
    finding_id: null,
    job_id: null,
    created_at: ago(240),
    is_read: true,
  },
];
