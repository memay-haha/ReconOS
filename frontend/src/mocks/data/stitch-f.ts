import type { ToolModuleRow } from '@/lib/tool-modules';

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
    accepts_wildcard: true,
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
    accepts_wildcard: false,
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
    accepts_wildcard: false,
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
    accepts_wildcard: false,
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
    accepts_wildcard: false,
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
    accepts_wildcard: false,
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
    accepts_wildcard: false,
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

/** Finding names for the `GET /search` mock only: GET /findings is served by the backend. */
export const findingSamples: readonly { id: string; name: string; program_id: string }[] = [
  {
    id: '0190d500-0000-7000-8000-000000000001',
    name: 'Spring Boot Actuator Environment Exposure',
    program_id: P1,
  },
  {
    id: '0190d500-0000-7000-8000-000000000002',
    name: 'Apache Log4j RCE (JNDI Remote Code Execution)',
    program_id: P1,
  },
  { id: '0190d500-0000-7000-8000-000000000003', name: 'Git Config Disclosure', program_id: P1 },
  {
    id: '0190d500-0000-7000-8000-000000000004',
    name: 'Subdomain Takeover: Dangling CNAME',
    program_id: P1,
  },
  {
    id: '0190d500-0000-7000-8000-000000000005',
    name: 'Open Redirect via Return URL',
    program_id: P1,
  },
  {
    id: '0190d500-0000-7000-8000-000000000006',
    name: 'GraphQL Introspection Enabled',
    program_id: P1,
  },
  {
    id: '0190d500-0000-7000-8000-000000000007',
    name: 'Deprecated TLS 1.0 Supported',
    program_id: P1,
  },
  {
    id: '0190d500-0000-7000-8000-000000000008',
    name: 'Nginx Ingress Controller Fingerprint',
    program_id: P1,
  },
];
