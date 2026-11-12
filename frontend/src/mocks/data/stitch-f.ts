import type { FindingDetail } from '@/lib/findings';
import type { ToolModuleRow } from '@/lib/tool-modules';

import { domains } from './part-c';
import { programs, toolModules } from './programs';

/** Sample data for S18 and S20 in the Stitch pass. Documentation domains and IPs only:
 * .claude/rules/testing.md. */

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const THREADS_RATE = {
  properties: {
    threads: { type: 'integer', title: 'Threads', default: 25, minimum: 1, maximum: 100 },
    rate: { type: 'integer', title: 'Rate (requests per second)', default: 150, minimum: 1 },
  },
};

type Extra = Omit<ToolModuleRow, keyof (typeof toolModules)[number]>;

const EXTRA: readonly Extra[] = [
  {
    title: 'Subdomain Enumeration',
    description:
      'Passive and brute-force subdomain discovery through the Osmedeus domain workflow.',
    runs_on: 'osmedeus',
    tools: ['subfinder', 'amass', 'dnsx'],
    output_types: ['domain', 'ip'],
    param_schema: { properties: { threads: THREADS_RATE.properties.threads } },
    last_job_at: minutesAgo(18),
    jobs_24h: 482,
    finding_count: 0,
    engine_status: 'ok',
    disabled_reason: null,
    estimated_seconds: 840,
  },
  {
    title: 'Screenshot Engine',
    description: 'Headless Chrome capture of live web interfaces for visual review.',
    runs_on: null,
    tools: ['gowitness'],
    output_types: ['screenshot', 'url'],
    param_schema: { properties: { threads: THREADS_RATE.properties.threads } },
    last_job_at: minutesAgo(5),
    jobs_24h: 128,
    finding_count: 0,
    engine_status: null,
    disabled_reason: null,
    estimated_seconds: 320,
  },
  {
    title: 'General Assessment',
    description:
      'Port scan, HTTP probe and content discovery through the Osmedeus general workflow.',
    runs_on: 'osmedeus',
    tools: ['naabu', 'httpx', 'ffuf'],
    output_types: ['service', 'url'],
    param_schema: {},
    last_job_at: minutesAgo(60),
    jobs_24h: 185,
    finding_count: 0,
    engine_status: 'ok',
    disabled_reason: null,
    estimated_seconds: 2400,
  },
  {
    title: 'Template Scan',
    description: 'Signature checks from Nuclei templates against discovered web endpoints.',
    runs_on: null,
    tools: ['nuclei'],
    output_types: ['finding'],
    param_schema: THREADS_RATE,
    last_job_at: minutesAgo(4),
    jobs_24h: 512,
    finding_count: 790,
    engine_status: null,
    disabled_reason: null,
    estimated_seconds: 600,
  },
  {
    title: 'Vulnerability Assessment',
    description: 'Native and agentic web assessment run by the Vigolium engine.',
    runs_on: 'vigolium',
    tools: [],
    output_types: ['finding', 'url'],
    param_schema: THREADS_RATE,
    last_job_at: minutesAgo(22),
    jobs_24h: 88,
    finding_count: 214,
    engine_status: 'degraded',
    disabled_reason: null,
    estimated_seconds: 3600,
  },
  {
    title: 'SQL Injection Exploit',
    description: 'Confirms SQL injection on a single parameter. Exploit jobs wait for approval.',
    runs_on: null,
    tools: ['sqlmap'],
    output_types: ['finding'],
    param_schema: { properties: { threads: { ...THREADS_RATE.properties.threads, maximum: 10 } } },
    last_job_at: minutesAgo(180),
    jobs_24h: 6,
    finding_count: 3,
    engine_status: null,
    disabled_reason: null,
    estimated_seconds: 1200,
  },
  {
    title: 'XSS Exploit',
    description: 'Reflected and DOM XSS confirmation with dalfox.',
    runs_on: null,
    tools: ['dalfox'],
    output_types: ['finding'],
    param_schema: {},
    last_job_at: null,
    jobs_24h: 0,
    finding_count: 0,
    engine_status: null,
    disabled_reason: 'off',
    estimated_seconds: null,
  },
];

export const toolModuleRows: ToolModuleRow[] = toolModules.map((m, i) => {
  const extra = EXTRA[i] as Extra;
  return { ...m, ...extra, is_enabled: extra.disabled_reason !== 'off' };
});

const P1 = programs[0]?.id ?? '';
const P2 = programs[1]?.id ?? '';
const domainId = (name: string) => domains.find((d) => d.name === name)?.id ?? null;

function finding(
  n: number,
  fields: Pick<FindingDetail, 'name' | 'severity' | 'triage_status' | 'matched_at' | 'matcher'> &
    Partial<FindingDetail>,
): FindingDetail {
  const id = `0190d500-0000-7000-8000-${String(n).padStart(12, '0')}`;
  return {
    id,
    program_id: P1,
    job_id: `0190e200-0000-7000-8000-${String(n).padStart(12, '0')}`,
    raw_output_id: `0190e300-0000-7000-8000-${String(n).padStart(12, '0')}`,
    domain_id: null,
    ip_id: null,
    url_id: null,
    service_id: null,
    template_id: null,
    evidence: null,
    cve: [],
    detail: null,
    duplicate_of_id: null,
    triaged_by: null,
    triaged_at: null,
    first_seen_at: minutesAgo(n * 37),
    last_seen_at: minutesAgo(n * 5),
    tool_module_name: 'nuclei',
    asset: null,
    description: null,
    remediation: null,
    request: null,
    response: null,
    in_scope: true,
    scope_rule: '*.example.com',
    ...fields,
  };
}

export const findingRows: FindingDetail[] = [
  finding(1, {
    name: 'Spring Boot Actuator Environment Exposure',
    template_id: 'spring-actuator-env',
    cve: ['CVE-2022-22965'],
    severity: 'critical',
    triage_status: 'confirmed',
    matched_at: 'https://api.example.com/actuator/env',
    matcher: 'word: activeProfiles',
    domain_id: domainId('api.example.com'),
    asset: {
      type: 'url',
      name: 'https://api.example.com/actuator/env',
      ip: '198.51.100.31',
      port: 443,
      service_name: 'https',
    },
    description:
      'The Spring Boot Actuator endpoint /actuator/env answers without authentication and lists the environment of the running service.',
    remediation:
      'Limit the exposed actuator endpoints with management.endpoints.web.exposure.include=health,info, or block /actuator/** at the gateway.',
    request:
      'GET /actuator/env HTTP/1.1\nHost: api.example.com\nUser-Agent: Nuclei\nAccept: application/json\nConnection: close',
    response:
      'HTTP/1.1 200 OK\nContent-Type: application/json\n\n{"activeProfiles":["production"],"propertySources":["***"]}',
    evidence: '"activeProfiles":["production"]',
  }),
  finding(2, {
    name: 'Apache Log4j RCE (JNDI Remote Code Execution)',
    template_id: 'log4j-jndi-rce',
    cve: ['CVE-2021-44228'],
    severity: 'critical',
    triage_status: 'new',
    matched_at: 'https://auth.example.com/oauth/v2/token',
    matcher: 'dns: interaction recorded',
    domain_id: domainId('auth.example.com'),
    asset: {
      type: 'url',
      name: 'https://auth.example.com/oauth/v2/token',
      ip: '198.51.100.24',
      port: 443,
      service_name: 'https',
    },
    description:
      'A JNDI lookup in the X-Api-Version header triggered an out-of-band DNS interaction.',
    remediation: 'Upgrade log4j-core to 2.17.1 or later.',
    request:
      'POST /oauth/v2/token HTTP/1.1\nHost: auth.example.com\nX-Api-Version: (JNDI lookup to oast.test)',
    response: 'HTTP/1.1 400 Bad Request',
  }),
  finding(3, {
    name: 'Git Config Disclosure',
    template_id: 'git-config-disclosure',
    severity: 'high',
    triage_status: 'reported',
    matched_at: 'https://legacy.example.com/.git/config',
    matcher: 'regex: repositoryformatversion',
    domain_id: domainId('legacy.example.com'),
    asset: {
      type: 'url',
      name: 'https://legacy.example.com/.git/config',
      ip: null,
      port: 443,
      service_name: 'https',
    },
  }),
  finding(4, {
    name: 'Subdomain Takeover: Dangling CNAME',
    template_id: 'github-pages-takeover',
    severity: 'high',
    triage_status: 'new',
    matched_at: 'https://vpn.example.org',
    matcher: 'cname: example-org.github.io',
    program_id: P2,
    domain_id: domainId('vpn.example.org'),
    asset: {
      type: 'domain',
      name: 'vpn.example.org',
      ip: '192.0.2.14',
      port: null,
      service_name: null,
    },
    in_scope: false,
    scope_rule: null,
  }),
  finding(5, {
    name: 'Open Redirect via Return URL',
    template_id: 'generic-open-redirect',
    severity: 'medium',
    triage_status: 'duplicate',
    matched_at: 'https://auth.example.com/oauth/callback?url=https://example.org',
    matcher: 'header: Location',
    domain_id: domainId('auth.example.com'),
    asset: {
      type: 'url',
      name: 'https://auth.example.com/oauth/callback',
      ip: '198.51.100.24',
      port: 443,
      service_name: 'https',
    },
  }),
  finding(6, {
    name: 'GraphQL Introspection Enabled',
    template_id: 'graphql-introspection',
    severity: 'medium',
    triage_status: 'new',
    matched_at: 'https://api.example.com/graphql',
    matcher: 'word: __schema',
    domain_id: domainId('api.example.com'),
    tool_module_name: 'vigolium',
    asset: {
      type: 'url',
      name: 'https://api.example.com/graphql',
      ip: '198.51.100.31',
      port: 443,
      service_name: 'https',
    },
  }),
  finding(7, {
    name: 'Deprecated TLS 1.0 Supported',
    template_id: 'ssl-deprecated-tls',
    severity: 'low',
    triage_status: 'confirmed',
    matched_at: 'status.example.org:8443',
    matcher: 'proto: TLSv1.0',
    program_id: P2,
    asset: {
      type: 'service',
      name: 'status.example.org:8443',
      ip: '203.0.113.9',
      port: 8443,
      service_name: 'https',
    },
  }),
  finding(8, {
    name: 'Nginx Ingress Controller Fingerprint',
    template_id: 'nginx-ingress-detect',
    severity: 'info',
    triage_status: 'false_positive',
    matched_at: 'https://www.example.com',
    matcher: 'header: Server',
    asset: {
      type: 'url',
      name: 'https://www.example.com',
      ip: '198.51.100.40',
      port: 443,
      service_name: 'https',
    },
  }),
];
