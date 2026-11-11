import type { DomainActivity, DomainDetail } from '@/lib/domains';
import type { SavedFilter } from '@/lib/saved-filters';

import { domains as baseDomains } from './part-c';
import { programs } from './programs';

/** Sample data for S04 and S05 in the Stitch pass. Documentation domains and addresses only:
 * .claude/rules/testing.md. */

const P1 = programs[0]?.id ?? '';
const P2 = programs[1]?.id ?? '';
const NONE = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
const HOUR = 3_600_000;

function ago(hours: number): string {
  return new Date(Date.now() - hours * HOUR).toISOString();
}

type Extra = Partial<DomainDetail> & { readonly name: string };

const EXTRA: readonly Extra[] = [
  {
    name: 'fleet-telemetry.example.com',
    ips: ['198.51.100.31', '198.51.100.32'],
    url_count: 2410,
    service_count: 19,
    finding_counts: { ...NONE, critical: 2, high: 5, medium: 7 },
  },
  { name: 'cdn-static.example.com', ips: ['203.0.113.10'], url_count: 6812, service_count: 2 },
  {
    name: 'checkout-sandbox.dev.example.com',
    ips: ['198.51.100.40'],
    url_count: 48,
    service_count: 5,
    finding_counts: { ...NONE, low: 3 },
  },
  {
    name: 'old-jira.example.test',
    dns_status: 'nxdomain',
    ips: [],
    url_count: 0,
    service_count: 0,
  },
  {
    name: 'k8s-ingress.emea.example.com',
    ips: ['203.0.113.21'],
    url_count: 319,
    service_count: 8,
    finding_counts: { ...NONE, high: 1, medium: 3 },
  },
  {
    name: 'grafana.monitor.example.org',
    program_id: P2,
    ips: ['192.0.2.30'],
    url_count: 14,
    service_count: 1,
  },
  {
    name: 'identity.example.org',
    program_id: P2,
    ips: ['192.0.2.31'],
    url_count: 512,
    service_count: 3,
    finding_counts: { ...NONE, high: 2, medium: 2 },
  },
  {
    name: 'sftp.internal.example.test',
    program_id: P2,
    dns_status: 'timeout',
    ips: ['192.0.2.40'],
    url_count: 8,
    service_count: 2,
    finding_counts: { ...NONE, info: 2 },
  },
  {
    name: 'partner-api.example.com',
    ips: ['198.51.100.50'],
    url_count: 4215,
    service_count: 14,
    finding_counts: { ...NONE, high: 4, medium: 6 },
  },
  {
    name: 'dev-cluster.example.test',
    dns_status: 'nxdomain',
    ips: [],
    url_count: 0,
    service_count: 0,
  },
  {
    name: 'sso-worker.example.org',
    program_id: P2,
    ips: ['192.0.2.50'],
    url_count: 144,
    service_count: 4,
    finding_counts: { ...NONE, medium: 1, low: 2 },
  },
  {
    name: 'billing-webhooks.example.com',
    ips: ['198.51.100.60'],
    url_count: 820,
    service_count: 3,
    finding_counts: { ...NONE, high: 1 },
  },
  {
    name: 'mail-relay.example.org',
    program_id: P2,
    ips: ['192.0.2.60'],
    url_count: 19,
    service_count: 7,
    finding_counts: { ...NONE, medium: 3 },
  },
  {
    name: 'docs-api.developer.example.com',
    ips: ['203.0.113.40'],
    url_count: 610,
    service_count: 2,
  },
  {
    name: 'vault-transit.example.test',
    program_id: P2,
    dns_status: 'timeout',
    ips: ['192.0.2.70'],
    url_count: 16,
    service_count: 3,
    finding_counts: { ...NONE, high: 1, medium: 1 },
  },
];

function extraDomain(n: number, extra: Extra): DomainDetail {
  const first = (n * 7) % 30;
  return {
    id: `0190d000-0000-7000-8000-${String(100 + n).padStart(12, '0')}`,
    program_id: P1,
    apex: extra.name.split('.').slice(-2).join('.'),
    is_wildcard: false,
    cname: null,
    dns_status: 'resolved',
    in_scope: true,
    first_seen_at: ago(first * 24 + 3),
    last_seen_at: ago((n % 6) + 1),
    ips: [],
    url_count: 0,
    service_count: 0,
    finding_counts: NONE,
    tags: [],
    ...extra,
  };
}

const extraDomains: DomainDetail[] = EXTRA.map((e, i) => extraDomain(i, e));

/** Part C domains first, so the ids other screens link to keep working, then the extras. Read
 * on every request: the part C tag routes replace rows of their own array. */
export function allDomains(): DomainDetail[] {
  return [...baseDomains, ...extraDomains];
}

/** Replaces one domain in whichever array holds it. */
export function updateDomain(id: string, change: (d: DomainDetail) => DomainDetail): boolean {
  for (const list of [baseDomains, extraDomains]) {
    const index = list.findIndex((d) => d.id === id);
    const found = list[index];
    if (found !== undefined) {
      list[index] = change(found);
      return true;
    }
  }
  return false;
}

/** Soft-deleted ids (D5): hidden from every read, as `deleted_at` hides them. */
export const deletedDomainIds = new Set<string>();

export const savedFilters: SavedFilter[] = [
  {
    id: '0190e900-0000-7000-8000-000000000001',
    screen: 'domains',
    name: 'Unresolved with findings',
    params: { dns_status: ['nxdomain', 'timeout'], has_findings: true },
    created_at: '2026-11-01T02:00:00Z',
  },
  {
    id: '0190e900-0000-7000-8000-000000000002',
    screen: 'domains',
    name: 'Example Corp *.example.com',
    params: { program_id: P1, q: '*.example.com' },
    created_at: '2026-11-02T02:00:00Z',
  },
];

/** A unified timeline for any domain (N12): asset events, findings, screenshots, newest first. */
export function activityOf(domain: DomainDetail): DomainActivity[] {
  const id = (n: number) =>
    `0190ea00-0000-7000-8000-${domain.id.slice(-6)}${String(n).padStart(6, '0')}`;
  const ip = domain.ips[1] ?? domain.ips[0] ?? null;
  const rows: DomainActivity[] = [
    {
      kind: 'finding',
      id: id(1),
      at: ago(2),
      title: 'OAuth open redirect',
      tool_module_name: 'nuclei',
      job_id: null,
    },
    {
      kind: 'asset_event',
      id: id(2),
      at: ago(4),
      title: 'Service 8443/tcp https discovered',
      tool_module_name: 'naabu',
      job_id: null,
    },
    ...(ip === null
      ? []
      : [
          {
            kind: 'asset_event' as const,
            id: id(3),
            at: ago(26),
            title: `dns_status changed, ${ip} added`,
            tool_module_name: 'dnsx',
            job_id: null,
          },
        ]),
    {
      kind: 'asset_event',
      id: id(4),
      at: ago(72),
      title: 'URL /login/callback discovered',
      tool_module_name: 'katana',
      job_id: null,
    },
    {
      kind: 'screenshot',
      id: id(5),
      at: ago(120),
      title: `https://${domain.name}/ captured, HTTP 200`,
      tool_module_name: 'gowitness',
      job_id: null,
    },
    {
      kind: 'asset_event',
      id: id(6),
      at: ago(312),
      title: `Domain ${domain.name} discovered`,
      tool_module_name: 'subfinder',
      job_id: null,
    },
  ];
  return rows;
}
