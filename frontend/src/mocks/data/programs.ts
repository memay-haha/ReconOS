import type { ProgramRow } from '@/lib/programs';
import type { ToolModule } from '@/lib/tool-modules';

const COUNTS = { critical: 1, high: 3, medium: 4, low: 2, info: 6 } as const;

/** Sample data uses documentation domains only: .claude/rules/testing.md. */
export const programs: readonly ProgramRow[] = [
  {
    id: '0190a000-0000-7000-8000-000000000001',
    name: 'Example Corp',
    platform: 'HackerOne',
    platform_url: 'https://hackerone.com/example',
    bounty_type: 'bounty',
    description: 'Main web properties.',
    status: 'active',
    created_by: null,
    created_at: '2026-10-01T02:00:00Z',
    updated_at: '2026-11-04T09:30:00Z',
    archived_at: null,
    in_scope_rule_count: 4,
    out_of_scope_rule_count: 1,
    domain_count: 128,
    ip_count: 40,
    url_count: 310,
    service_count: 72,
    finding_counts: COUNTS,
  },
  {
    id: '0190a000-0000-7000-8000-000000000002',
    name: 'Example Org VDP',
    platform: 'Self-hosted',
    platform_url: null,
    bounty_type: 'vdp',
    description: null,
    status: 'paused',
    created_by: null,
    created_at: '2026-10-12T02:00:00Z',
    updated_at: '2026-11-02T03:00:00Z',
    archived_at: null,
    in_scope_rule_count: 2,
    out_of_scope_rule_count: 0,
    domain_count: 16,
    ip_count: 5,
    url_count: 22,
    service_count: 9,
    finding_counts: { critical: 0, high: 0, medium: 1, low: 0, info: 2 },
  },
];

function toolModule(id: string, name: string, group: ToolModule['group']): ToolModule {
  return {
    id,
    name,
    group,
    is_enabled: true,
    default_params: {},
    max_concurrency: 2,
    rate_limit_per_minute: null,
    timeout_minutes: 120,
    updated_at: '2026-11-01T00:00:00Z',
  };
}

export const toolModules: readonly ToolModule[] = [
  toolModule('0190b000-0000-7000-8000-000000000001', 'osmedeus-domain-lite', 'recon'),
  toolModule('0190b000-0000-7000-8000-000000000002', 'gowitness', 'recon'),
  toolModule('0190b000-0000-7000-8000-000000000003', 'osmedeus-general', 'scan'),
  toolModule('0190b000-0000-7000-8000-000000000004', 'nuclei', 'scan'),
  toolModule('0190b000-0000-7000-8000-000000000005', 'vigolium', 'scan'),
  toolModule('0190b000-0000-7000-8000-000000000006', 'sqlmap', 'exploit'),
  toolModule('0190b000-0000-7000-8000-000000000007', 'dalfox', 'exploit'),
];
