import type { Job, JobStatus } from '@/lib/jobs';
import type {
  ConsoleEntry,
  NetworkEntry,
  ScreenshotCookie,
  ScreenshotDetail,
  ScreenshotTechnology,
} from '@/lib/screenshots';
import type { Technology } from '@/lib/url-detail';

import { programs, toolModules } from './programs';

/** Sample data for S06 and S07 (agent C of the Stitch pass). Documentation domains and
 * addresses only: .claude/rules/testing.md. */
const PROGRAM_ID = programs[0]?.id ?? '0190a000-0000-7000-8000-000000000001';
export const GOWITNESS_ID =
  toolModules.find((m) => m.name === 'gowitness')?.id ?? '0190b000-0000-7000-8000-000000000002';

function uuid(prefix: string, n: number): string {
  return `${prefix}-0000-7000-8000-${String(n).padStart(12, '0')}`;
}

const TECH: Readonly<Record<string, Technology>> = Object.fromEntries(
  (
    [
      ['Nginx', 'web server'],
      ['React', 'framework'],
      ['Cloudflare', 'CDN'],
      ['Envoy', 'proxy'],
      ['Go', 'language'],
      ['Apache', 'web server'],
      ['OpenSSL', 'crypto'],
      ['Next.js', 'framework'],
      ['Rails', 'framework'],
      ['PostgreSQL', 'database'],
      ['Python', 'language'],
      ['Flask', 'framework'],
      ['Grafana', 'monitoring'],
      ['Jenkins', 'CI pipeline'],
    ] as const
  ).map(([name, category], i) => [name, { id: uuid('0190d200', i + 1), name, category }]),
);

export const technologies: readonly Technology[] = Object.values(TECH).sort((a, b) =>
  a.name.localeCompare(b.name),
);

interface Seed {
  readonly host: string;
  readonly path: string;
  readonly title: string | null;
  readonly status: number | null;
  readonly hash: string | null;
  readonly tech: readonly string[];
  readonly hoursAgo: number;
  readonly error?: string;
  readonly retry?: JobStatus | null;
}

// The first eight keep the ids of the part D sample, so links from S02 and S05 still open.
const SEEDS: readonly Seed[] = [
  {
    host: 'auth.example.com',
    path: '/login',
    title: 'Single Sign-On | Corporate IdP',
    status: 200,
    hash: 'p:a1',
    tech: ['React', 'Nginx', 'Cloudflare'],
    hoursAgo: 2,
  },
  {
    host: 'api.example.com',
    path: '/v1/health',
    title: 'API Gateway Health Status',
    status: 200,
    hash: 'p:b2',
    tech: ['Go', 'Envoy'],
    hoursAgo: 3,
  },
  {
    host: 'admin.example.org',
    path: '/',
    title: '403 Forbidden - Access Restricted',
    status: 403,
    hash: 'p:c3',
    tech: ['Apache', 'OpenSSL'],
    hoursAgo: 5,
  },
  {
    host: 'legacy.example.test',
    path: ':8443/',
    title: null,
    status: null,
    hash: null,
    tech: [],
    hoursAgo: 6,
    error: 'net::ERR_CONNECTION_TIMED_OUT',
    retry: 'queued',
  },
  {
    host: 'billing.example.com',
    path: '/',
    title: 'Invoicing & Billing Center',
    status: 200,
    hash: 'p:a1',
    tech: ['Next.js', 'React'],
    hoursAgo: 24,
  },
  {
    host: 'git.example.org',
    path: '/',
    title: 'GitLab Enterprise Edition',
    status: 200,
    hash: 'p:d4',
    tech: ['Rails', 'PostgreSQL'],
    hoursAgo: 26,
  },
  {
    host: 'status.example.com',
    path: '/',
    title: '500 Internal Server Error',
    status: 500,
    hash: 'p:e5',
    tech: ['Python', 'Flask'],
    hoursAgo: 48,
  },
  {
    host: 'docs.example.org',
    path: '/',
    title: 'Developer Documentation',
    status: 301,
    hash: 'p:a1',
    tech: ['Nginx'],
    hoursAgo: 50,
  },
  {
    host: 'grafana.example.com',
    path: '/',
    title: 'Grafana Monitoring Dashboard',
    status: 200,
    hash: 'p:c3',
    tech: ['Grafana', 'Go'],
    hoursAgo: 4,
  },
  {
    host: 'ci.example.org',
    path: '/',
    title: 'Jenkins CI/CD Orchestration',
    status: 200,
    hash: 'p:f6',
    tech: ['Jenkins'],
    hoursAgo: 6,
  },
  {
    host: 'pay.example.test',
    path: '/',
    title: '502 Bad Gateway - Upstream Timeout',
    status: 502,
    hash: 'p:e5',
    tech: ['Nginx'],
    hoursAgo: 72,
  },
  {
    host: 'old.example.org',
    path: '/',
    title: null,
    status: null,
    hash: null,
    tech: [],
    hoursAgo: 80,
    error: 'net::ERR_NAME_NOT_RESOLVED',
    retry: null,
  },
];

const NOW = Date.now();

function technologiesOf(names: readonly string[]): readonly ScreenshotTechnology[] {
  return names.flatMap((n) => {
    const t = TECH[n];
    return t === undefined ? [] : [{ name: t.name, category: t.category }];
  });
}

function network(host: string, path: string, ok: boolean): readonly NetworkEntry[] {
  const ip = '198.51.100.24';
  return [
    {
      method: 'GET',
      url: `https://${host}${path}`,
      status_code: ok ? 200 : 403,
      content_type: 'text/html',
      size_bytes: 14_540,
      duration_ms: 120,
      remote_ip: ip,
    },
    {
      method: 'GET',
      url: `https://${host}/assets/bundle.min.js`,
      status_code: 200,
      content_type: 'application/javascript',
      size_bytes: 188_416,
      duration_ms: 45,
      remote_ip: ip,
    },
    {
      method: 'GET',
      url: `https://${host}/assets/theme.css`,
      status_code: 200,
      content_type: 'text/css',
      size_bytes: 22_528,
      duration_ms: 18,
      remote_ip: ip,
    },
    {
      method: 'POST',
      url: `https://${host}/api/v1/telemetry/beacon`,
      status_code: 204,
      content_type: null,
      size_bytes: 0,
      duration_ms: 85,
      remote_ip: ip,
    },
    {
      method: 'GET',
      url: `https://${host}/favicon.ico`,
      status_code: 404,
      content_type: 'text/html',
      size_bytes: 1_126,
      duration_ms: 30,
      remote_ip: ip,
    },
    {
      method: 'GET',
      url: `https://${host}/fonts/ibm-plex-sans.woff2`,
      status_code: 200,
      content_type: 'font/woff2',
      size_bytes: 65_536,
      duration_ms: 38,
      remote_ip: ip,
    },
    {
      method: 'GET',
      url: `https://${host}/api/v1/session`,
      status_code: 401,
      content_type: 'application/json',
      size_bytes: 96,
      duration_ms: 22,
      remote_ip: '203.0.113.9',
    },
    {
      method: 'GET',
      url: `https://${host}/assets/logo.svg`,
      status_code: 200,
      content_type: 'image/svg+xml',
      size_bytes: 3_210,
      duration_ms: 12,
      remote_ip: ip,
    },
  ];
}

const CONSOLE: readonly ConsoleEntry[] = [
  { level: 'info', message: 'App initialized. Handshake stage: AUTHORIZE_CHALLENGE', at: null },
  { level: 'warn', message: 'GET /favicon.ico returned 404. Fallback asset deployed.', at: null },
  { level: 'debug', message: 'WebSocket connection established.', at: null },
];

const COOKIES: readonly ScreenshotCookie[] = [
  {
    name: '__Host-session_id',
    domain: null,
    path: '/',
    expires: null,
    secure: true,
    http_only: true,
    same_site: 'Strict',
  },
  {
    name: '_cf_bm',
    domain: '.example.com',
    path: '/',
    expires: '2026-12-01T00:00:00Z',
    secure: true,
    http_only: true,
    same_site: 'None',
  },
  {
    name: 'xsrf_token',
    domain: null,
    path: '/',
    expires: null,
    secure: true,
    http_only: false,
    same_site: 'Lax',
  },
  {
    name: 'theme_mode',
    domain: null,
    path: '/',
    expires: null,
    secure: false,
    http_only: false,
    same_site: null,
  },
];

const HEADERS = {
  server: 'nginx',
  'content-type': 'text/html; charset=UTF-8',
  'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
  'content-security-policy': "default-src 'self'; script-src 'self'",
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'permissions-policy': 'camera=(), microphone=()',
  'set-cookie': ['__Host-session_id=redacted; Path=/; Secure; HttpOnly', 'theme_mode=dark; Path=/'],
  'cache-control': 'no-store',
  'cf-ray': '8c9735a2981-IAD',
  vary: 'Accept-Encoding',
};

const SECURITY = [
  'strict-transport-security',
  'content-security-policy',
  'x-frame-options',
  'x-content-type-options',
  'permissions-policy',
] as const;

export interface SampleScreenshot extends ScreenshotDetail {
  readonly network_log: readonly NetworkEntry[];
}

export const screenshotSamples: readonly SampleScreenshot[] = SEEDS.map((seed, i) => {
  const failed = seed.error !== undefined;
  const headers: Record<string, unknown> | null = failed
    ? null
    : i === 2
      ? { server: 'Apache', 'content-type': 'text/html', 'x-frame-options': 'SAMEORIGIN' }
      : HEADERS;
  const security = Object.fromEntries(SECURITY.map((h) => [h, headers !== null && h in headers]));
  const passed = Object.values(security).filter(Boolean).length;
  const captured = new Date(NOW - seed.hoursAgo * 3_600_000).toISOString();
  return {
    id: uuid('0190d300', i + 1),
    program_id: PROGRAM_ID,
    url_id: uuid('0190d100', (i % 8) + 1),
    job_id: uuid('0190d400', i < 8 ? 1 : 2),
    raw_output_id: uuid('0190d500', i + 1),
    final_url: `https://${seed.host}${seed.path}`,
    status_code: seed.status,
    title: seed.title,
    perception_hash: seed.hash,
    http_headers: headers,
    is_failed: failed,
    error_message: seed.error ?? null,
    captured_at: captured,
    similar_group: null,
    similar_count: 1,
    technologies: technologiesOf(seed.tech),
    retry_job_status: seed.retry ?? null,
    width: failed ? null : 1920,
    height: failed ? null : 1080,
    worker_name: 'gowitness-02',
    device_scale: failed ? null : 2,
    remote_ip: failed ? null : '198.51.100.24',
    duration_ms: 2_480 + i * 37,
    tls: failed
      ? null
      : {
          protocol: 'TLS 1.3',
          cipher: 'TLS_AES_256_GCM_SHA384',
          issuer: "Let's Encrypt Authority R3",
          subject: seed.host,
          san: [seed.host, `www.${seed.host}`],
          not_before: '2026-08-15T00:00:00Z',
          not_after: '2027-01-15T00:00:00Z',
        },
    console_log: failed ? [] : CONSOLE,
    cookies: failed ? [] : COOKIES,
    html_size: failed ? null : 49_357,
    html_sha256: failed ? null : '74d82b4510ad6714c1e45903bda91c0f2a4e7c9b18d3f5a6e2b0c4d8f1a3e5b7',
    security_headers: security,
    security_headers_passed: passed,
    security_headers_total: SECURITY.length,
    network_log: failed ? [] : network(seed.host, seed.path, seed.status !== 403),
  };
});

export const SAMPLE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Single Sign-On | Corporate Identity Portal</title>
  <link rel="stylesheet" href="/assets/theme.css"/>
  <script src="/assets/bundle.min.js" defer></script>
</head>
<body>
  <div id="root">
    <h1>Identity Vault SSO</h1>
    <form id="auth-form" method="POST" action="/oauth/authorize/submit">
      <input type="text" name="username"/>
      <input type="password" name="password"/>
      <button type="submit">Authorize Session</button>
    </form>
  </div>
</body>
</html>
`;

function job(n: number, status: JobStatus, target: readonly string[], minutesAgo: number): Job {
  const at = new Date(NOW - minutesAgo * 60_000).toISOString();
  const running = status === 'running' || status === 'dispatched';
  const done = status === 'completed' || status === 'failed';
  return {
    id: uuid('0190d400', n),
    program_id: PROGRAM_ID,
    tool_module_id: GOWITNESS_ID,
    status,
    priority: 'normal',
    target,
    params: {},
    proxy_id: null,
    schedule_id: null,
    retry_of_job_id: null,
    worker_id: running || done ? uuid('0190e000', 2) : null,
    created_by: null,
    approved_by: null,
    status_reason: null,
    created_at: at,
    approved_at: null,
    dispatched_at: running || done ? at : null,
    started_at: running || done ? at : null,
    last_heartbeat_at: running ? at : null,
    finished_at: done ? at : null,
  };
}

/** gowitness jobs: one finished scan per sample batch, and a few still waiting. */
export const gowitnessJobs: readonly Job[] = [
  job(
    1,
    'completed',
    SEEDS.slice(0, 8).map((s) => `https://${s.host}/`),
    60 * 30,
  ),
  job(
    2,
    'completed',
    SEEDS.slice(8).map((s) => `https://${s.host}/`),
    60 * 5,
  ),
  job(3, 'queued', ['https://ingress.example.com/'], 4),
  job(4, 'running', ['https://shop.example.org/', 'https://cdn.example.org/'], 1),
];
