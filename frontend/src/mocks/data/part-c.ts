import type { DomainDetail, DomainTag } from '@/lib/domains';
import type { Ip } from '@/lib/ips';
import type { Service } from '@/lib/services';
import type { Tag } from '@/lib/tags';
import type { UrlRow } from '@/lib/urls';

import { programs } from './programs';

/** Sample assets for part C. Documentation domains and addresses only: .claude/rules/testing.md. */

const P1 = programs[0]?.id ?? '';
const P2 = programs[1]?.id ?? '';
const SEEN = { first_seen_at: '2026-10-12T07:22:00Z', last_seen_at: '2026-11-04T01:05:00Z' };
const NONE = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };

export const tags: Tag[] = [
  {
    id: '0190e000-0000-7000-8000-000000000001',
    key: 'env',
    value: 'prod',
    created_by: null,
    created_at: '2026-10-01T00:00:00Z',
  },
  {
    id: '0190e000-0000-7000-8000-000000000002',
    key: 'tier',
    value: 'auth',
    created_by: null,
    created_at: '2026-10-01T00:00:00Z',
  },
  {
    id: '0190e000-0000-7000-8000-000000000003',
    key: 'owner',
    value: 'web',
    created_by: null,
    created_at: '2026-10-01T00:00:00Z',
  },
];

function domain(
  n: number,
  name: string,
  programId: string,
  extra: Partial<DomainDetail> = {},
): DomainDetail {
  return {
    id: `0190d000-0000-7000-8000-${String(n).padStart(12, '0')}`,
    program_id: programId,
    name,
    apex: name.split('.').slice(-2).join('.'),
    is_wildcard: false,
    cname: null,
    dns_status: 'resolved',
    in_scope: true,
    ...SEEN,
    ips: ['198.51.100.24'],
    url_count: 3,
    service_count: 2,
    finding_counts: NONE,
    tags: [],
    ...extra,
  };
}

export const domains: DomainDetail[] = [
  domain(1, 'auth.example.com', P1, {
    ips: ['198.51.100.24', '198.51.100.25'],
    url_count: 14,
    service_count: 4,
    finding_counts: { critical: 1, high: 1, medium: 2, low: 0, info: 0 },
    tags: [
      {
        id: '0190f000-0000-7000-8000-000000000001',
        tag_id: tags[0]?.id ?? '',
        key: 'env',
        value: 'prod',
      },
    ],
  }),
  domain(2, 'api.example.com', P1, { finding_counts: { ...NONE, medium: 3, low: 1 } }),
  domain(3, 'legacy.example.com', P1, {
    dns_status: 'nxdomain',
    ips: [],
    url_count: 0,
    service_count: 0,
  }),
  domain(4, 'vpn.example.org', P2, { dns_status: 'timeout', ips: ['192.0.2.14'] }),
  domain(5, 'status.example.org', P2, { in_scope: false, dns_status: 'unknown', ips: [] }),
];

export const ips: Ip[] = [
  {
    id: '0190d100-0000-7000-8000-000000000001',
    program_id: P1,
    address: '198.51.100.24',
    asn: 64500,
    asn_org: 'EXAMPLE-NET',
    country: 'VN',
    is_private: false,
    cdn_name: null,
    ptr: 'auth.example.com',
    in_scope: true,
    ...SEEN,
  },
  {
    id: '0190d100-0000-7000-8000-000000000002',
    program_id: P2,
    address: '192.0.2.14',
    asn: 64501,
    asn_org: 'EXAMPLE-ORG',
    country: null,
    is_private: false,
    cdn_name: 'example-cdn',
    ptr: null,
    in_scope: true,
    ...SEEN,
  },
];

export const urls: UrlRow[] = [
  {
    id: '0190d200-0000-7000-8000-000000000001',
    program_id: P1,
    domain_id: domains[0]?.id ?? null,
    ip_id: ips[0]?.id ?? null,
    url: 'https://auth.example.com/login',
    scheme: 'https',
    host: 'auth.example.com',
    port: 443,
    path: '/login',
    status_code: 200,
    title: 'Sign in',
    content_length: 5120,
    content_type: 'text/html',
    webserver: 'nginx',
    favicon_hash: null,
    in_scope: true,
    ...SEEN,
  },
  {
    id: '0190d200-0000-7000-8000-000000000002',
    program_id: P1,
    domain_id: domains[1]?.id ?? null,
    ip_id: null,
    url: 'https://api.example.com/v1/health',
    scheme: 'https',
    host: 'api.example.com',
    port: 443,
    path: '/v1/health',
    status_code: 404,
    title: null,
    content_length: 0,
    content_type: 'application/json',
    webserver: null,
    favicon_hash: null,
    in_scope: true,
    ...SEEN,
  },
];

export const services: Service[] = [
  {
    id: '0190d300-0000-7000-8000-000000000001',
    program_id: P1,
    ip_id: ips[0]?.id ?? '',
    port: 443,
    transport: 'tcp',
    name: 'https',
    product: 'nginx',
    version: '1.25',
    banner: null,
    in_scope: true,
    ...SEEN,
  },
  {
    id: '0190d300-0000-7000-8000-000000000002',
    program_id: P2,
    ip_id: ips[1]?.id ?? '',
    port: 8443,
    transport: 'tcp',
    name: 'https',
    product: 'Apache',
    version: '2.4.52',
    banner: null,
    in_scope: true,
    ...SEEN,
  },
];

export function tagOf(tagId: string): DomainTag | null {
  const found = tags.find((t) => t.id === tagId);
  return found === undefined
    ? null
    : { id: '', tag_id: found.id, key: found.key, value: found.value };
}
