import type { Engine, EngineVariable } from '@/lib/engines';

/** Sample data uses documentation domains and addresses only: .claude/rules/testing.md. */

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
