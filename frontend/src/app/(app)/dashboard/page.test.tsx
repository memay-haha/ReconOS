import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import DashboardPage from './page';
import { SUMMARY } from './test-fixtures';

const EVENT = {
  id: 'e1',
  program_id: 'p1',
  domain_id: 'd1',
  ip_id: null,
  url_id: null,
  service_id: null,
  event_type: 'discovered',
  job_id: 'j1',
  raw_output_id: 'r1',
  diff: null,
  created_at: '2026-11-04T01:05:00Z',
  asset_type: 'domain',
  asset_name: 'api.example.com',
  program_name: 'Example Corp',
  tool_module_name: 'subfinder',
};

const FINDING = {
  id: 'f1',
  program_id: 'p1',
  job_id: 'j1',
  raw_output_id: 'r1',
  domain_id: 'd1',
  ip_id: null,
  url_id: null,
  service_id: null,
  name: 'Spring Boot Actuator',
  template_id: 'spring-actuator-env',
  severity: 'critical',
  matched_at: 'https://auth.example.com/actuator/env',
  evidence: null,
  cve: ['CVE-2024-0001'],
  detail: null,
  triage_status: 'new',
  duplicate_of_id: null,
  triaged_by: null,
  triaged_at: null,
  first_seen_at: '2026-11-04T01:10:00Z',
  last_seen_at: '2026-11-04T01:10:00Z',
  tool_module_name: 'nuclei',
  asset: null,
  matcher: null,
};

const CERT = {
  id: 'a1',
  alert_type: 'cert_expiring',
  message: 'TLS certificate of https://auth.example.com expires in 6 days',
  program_id: 'p1',
  finding_id: null,
  job_id: null,
  created_at: '2026-11-04T00:30:00Z',
  is_read: false,
};

const JOB = {
  id: '0190b000-0000-7000-8000-0000000a8491',
  program_id: 'p1',
  tool_module_id: 't1',
  status: 'completed',
  priority: 'normal',
  target: ['a.example.com', 'b.example.com'],
  params: {},
  proxy_id: null,
  schedule_id: null,
  retry_of_job_id: null,
  worker_id: null,
  created_by: null,
  approved_by: null,
  status_reason: null,
  created_at: '2026-11-04T00:00:00Z',
  approved_at: null,
  dispatched_at: null,
  started_at: null,
  last_heartbeat_at: null,
  finished_at: '2026-11-04T01:00:00Z',
};

const TOOL = {
  id: 't1',
  name: 'gowitness',
  group: 'scan',
  is_enabled: true,
  default_params: {},
  max_concurrency: 1,
  rate_limit_per_minute: null,
  timeout_minutes: 30,
  updated_at: '2026-11-01T00:00:00Z',
};

function page(items: unknown[]) {
  return { items, next_cursor: null, total: items.length, total_is_estimate: false };
}

function problem(status: number) {
  return new Response(JSON.stringify({ title: 'Internal Server Error', status }), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  });
}

interface Sources {
  summary?: () => Response;
  events?: () => Response;
  findings?: () => Response;
  jobs?: () => Response;
  alerts?: () => Response;
}

function stub(sources: Sources = {}) {
  const fetchMock = vi.fn((path: string) => {
    if (path.startsWith('/api/v1/dashboard/summary')) {
      return Promise.resolve((sources.summary ?? (() => Response.json(SUMMARY)))());
    }
    if (path.startsWith('/api/v1/asset-events')) {
      return Promise.resolve((sources.events ?? (() => Response.json(page([EVENT]))))());
    }
    if (path.startsWith('/api/v1/findings')) {
      return Promise.resolve((sources.findings ?? (() => Response.json(page([FINDING]))))());
    }
    if (path.startsWith('/api/v1/jobs')) {
      return Promise.resolve((sources.jobs ?? (() => Response.json(page([JOB]))))());
    }
    if (path.startsWith('/api/v1/alerts')) {
      return Promise.resolve((sources.alerts ?? (() => Response.json(page([CERT]))))());
    }
    if (path.startsWith('/api/v1/tool-modules'))
      return Promise.resolve(Response.json(page([TOOL])));
    return Promise.resolve(problem(404));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DashboardPage />
    </QueryClientProvider>,
  );
}

function paths(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map((c) => c[0] as string);
}

function panel(title: string): HTMLElement {
  const heading = screen.getByRole('heading', { name: title });
  return heading.closest('.shadow-sm') as HTMLElement;
}

afterEach(() => vi.unstubAllGlobals());

const FEED = 'Recent Activity (Live WebSocket)';

describe('S02 dashboard', () => {
  it('reads the summary for the last 24 hours and the three feed sources', async () => {
    const fetchMock = stub();
    wrap();
    await screen.findByText('api.example.com');
    expect(paths(fetchMock)).toContain('/api/v1/dashboard/summary?window=24h');
    expect(paths(fetchMock)).toContain('/api/v1/asset-events?sort=-created_at&limit=8');
    expect(paths(fetchMock)).toContain('/api/v1/findings?sort=-first_seen_at&limit=8');
    expect(paths(fetchMock)).toContain('/api/v1/jobs?sort=-created_at&limit=8');
    expect(paths(fetchMock)).toContain('/api/v1/alerts?sort=-created_at&limit=8');
  });

  it('says it is synced and refreshes every 30s, as the mockup does', async () => {
    stub();
    wrap();
    expect(await screen.findByText('SYNCED')).toBeInTheDocument();
    expect(screen.getByText(/across 24 programs\. Auto-refreshes every 30s\./)).toBeInTheDocument();
  });

  it('shows each KPI with thousands separators and what is new today', async () => {
    stub();
    wrap();
    expect(await screen.findByText('14,892')).toBeInTheDocument();
    expect(screen.getByText('86,410')).toBeInTheDocument();
    expect(screen.getByText('+2 today')).toBeInTheDocument();
    expect(screen.getAllByText('+1,204 today').length).toBeGreaterThan(0);
    // Decision M3: the Services tile counts services closed in the window.
    expect(screen.getByText('−74 closed')).toBeInTheDocument();
  });

  it('asks for the chosen window and words the change for it', async () => {
    const user = userEvent.setup();
    const fetchMock = stub();
    wrap();
    await screen.findByText('14,892');
    await user.click(screen.getByRole('button', { name: '7d' }));
    expect(screen.getByRole('button', { name: '7d' })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByText('+2 this week')).toBeInTheDocument();
    expect(paths(fetchMock)).toContain('/api/v1/dashboard/summary?window=7d');
  });

  it('charts 14 days per asset type with today and the peak', async () => {
    stub();
    wrap();
    await screen.findByText('14,892');
    const chart = panel('New Assets Discovered (14 Days)');
    expect(within(chart).getByText('Domains Discovered')).toBeInTheDocument();
    expect(within(chart).getByText('+1,204')).toBeInTheDocument();
    expect(within(chart).getByText('1,480/d')).toBeInTheDocument();
    expect(within(chart).getByText('+5,320')).toBeInTheDocument();
    expect(within(chart).getByText('+88')).toBeInTheDocument();
  });

  it('ranks programs by domains and ports by services, with their footers', async () => {
    stub();
    wrap();
    await screen.findByText('14,892');
    const programs = panel('Top Programs by Domains');
    expect(within(programs).getByText('uber-bb')).toBeInTheDocument();
    expect(within(programs).getByText('5,142 domains')).toBeInTheDocument();
    expect(within(programs).getByText('Active targets: 22 active')).toBeInTheDocument();
    expect(within(programs).getByText('Scope coverage: 99.4%')).toBeInTheDocument();

    const ports = panel('Top Open Ports');
    expect(within(ports).getByText('443/tcp')).toBeInTheDocument();
    expect(within(ports).getByText('https')).toBeInTheDocument();
    expect(within(ports).getByText('8,240 services')).toBeInTheDocument();
    expect(within(ports).getByText('Active services: 9,842')).toBeInTheDocument();
    expect(within(ports).getByText('Top protocol: HTTPS (72%)')).toBeInTheDocument();
  });

  it('counts findings by severity with the verified-CVE footer', async () => {
    stub();
    wrap();
    await screen.findByText('14,892');
    const findings = panel('Findings by Severity');
    expect(within(findings).getByText('Critical')).toBeInTheDocument();
    expect(within(findings).getByText('156')).toBeInTheDocument();
    expect(within(findings).getByText('3 CVEs verified in past 24h')).toBeInTheDocument();
    expect(within(findings).getByText('Total: 309')).toBeInTheDocument();
  });

  it('breaks jobs into all seven statuses and a total, with workers and throughput', async () => {
    stub();
    wrap();
    await screen.findByText('14,892');
    const jobs = panel('Queue Snapshot');
    for (const label of [
      'Total jobs',
      'Queued',
      'Dispatched',
      'Running',
      'Completed',
      'Failed',
      'Pending approval',
      'Cancelled',
    ]) {
      expect(within(jobs).getByText(label)).toBeInTheDocument();
    }
    expect(within(jobs).getByText('2,418')).toBeInTheDocument();
    expect(within(jobs).getByText('Worker instances: 6 running')).toBeInTheDocument();
    expect(within(jobs).getByText('Throughput: ~182 jobs/min')).toBeInTheDocument();
  });

  it('merges asset events, findings, jobs and expiring certificates, newest first', async () => {
    stub();
    wrap();
    await screen.findByText('api.example.com');
    const feed = panel(FEED);
    const rows = Array.from(feed.querySelectorAll('time')).map((t) => t.getAttribute('datetime'));
    expect(rows).toEqual([
      FINDING.first_seen_at,
      EVENT.created_at,
      JOB.finished_at,
      CERT.created_at,
    ]);
    expect(within(feed).getByText('CVE-2024-0001')).toBeInTheDocument();
    expect(within(feed).getByText('#000a8491')).toBeInTheDocument();
    expect(within(feed).getByText('gowitness')).toBeInTheDocument();
    // The tool module that produced each line.
    expect(within(feed).getByText('nuclei')).toBeInTheDocument();
    expect(within(feed).getByText('subfinder')).toBeInTheDocument();
    expect(within(feed).getByText(CERT.message)).toBeInTheDocument();
    // Relative time on screen, the pinned date in the title.
    const first = feed.querySelector('time') as HTMLElement;
    expect(first.textContent).toMatch(/ago$/);
    expect(first).toHaveAttribute('title', '04/11/2026 08:10');
  });

  it('renders untrusted asset names as text, never as markup', async () => {
    stub({
      events: () => Response.json(page([{ ...EVENT, asset_name: '<img src=x onerror=alert(1)>' }])),
    });
    const { container } = wrap();
    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('says the feed is empty rather than showing nothing', async () => {
    stub({
      events: () => Response.json(page([])),
      findings: () => Response.json(page([])),
      jobs: () => Response.json(page([])),
      alerts: () => Response.json(page([])),
    });
    wrap();
    expect(await screen.findByText('No activity yet.')).toBeInTheDocument();
  });

  it('pauses and resumes the stream', async () => {
    const user = userEvent.setup();
    stub();
    wrap();
    await screen.findByText('api.example.com');
    expect(screen.getByText('Auto-scroll: ON')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pause stream' }));
    expect(screen.getByText('Auto-scroll: OFF')).toBeInTheDocument();
    expect(screen.getByText('api.example.com')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Resume stream' }));
    expect(screen.getByText('Auto-scroll: ON')).toBeInTheDocument();
  });

  it('groups the asset events of one job into one line', async () => {
    stub({
      events: () =>
        Response.json(
          page([
            EVENT,
            { ...EVENT, id: 'e2', asset_name: 'www.example.com' },
            { ...EVENT, id: 'e3', asset_name: 'cdn.example.com' },
          ]),
        ),
    });
    wrap();
    const line = await screen.findByText(/and 2 more/);
    expect(line).toHaveTextContent(
      'Discovered 3 domains (api.example.com and 2 more) via subfinder under program Example Corp',
    );
  });

  it('names the ASN on a single IP line', async () => {
    stub({
      events: () =>
        Response.json(
          page([
            {
              ...EVENT,
              asset_type: 'ip',
              asset_name: '198.51.100.24',
              asn: 64500,
              asn_org: 'EXAMPLE-NET',
            },
          ]),
        ),
    });
    wrap();
    expect(await screen.findByText('AS64500 EXAMPLE-NET')).toBeInTheDocument();
  });

  it('opens the Services tab of S03 from Top Open Ports', async () => {
    stub();
    wrap();
    await screen.findByText('14,892');
    const ports = panel('Top Open Ports');
    expect(within(ports).getByRole('link', { name: /View all/ })).toHaveAttribute(
      'href',
      '/monitor?tab=services',
    );
  });

  it('reports a failed summary in its own words, not the backend title', async () => {
    stub({ summary: () => problem(500) });
    wrap();
    expect(await screen.findByText('OUT OF SYNC')).toBeInTheDocument();
    expect((await screen.findAllByRole('alert'))[0]).toHaveTextContent(
      'Could not load the dashboard figures.',
    );
    expect(screen.queryByText('Internal Server Error')).toBeNull();
  });

  it('reports a failed feed without hiding the figures', async () => {
    stub({ findings: () => problem(500) });
    wrap();
    expect(await screen.findByText('Could not load the recent activity.')).toBeInTheDocument();
    expect(screen.getByText('14,892')).toBeInTheDocument();
  });

  it('reloads the summary and the feed on Refresh', async () => {
    const user = userEvent.setup();
    const fetchMock = stub();
    wrap();
    await screen.findByText('api.example.com');
    const before = paths(fetchMock).length;
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await vi.waitFor(() => {
      const after = paths(fetchMock).slice(before);
      expect(after.some((p) => p.startsWith('/api/v1/dashboard/summary'))).toBe(true);
      expect(after.some((p) => p.startsWith('/api/v1/asset-events'))).toBe(true);
      expect(after.some((p) => p.startsWith('/api/v1/findings'))).toBe(true);
      expect(after.some((p) => p.startsWith('/api/v1/jobs'))).toBe(true);
    });
  });
});
