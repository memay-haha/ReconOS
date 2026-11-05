import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import DashboardPage from './page';

const SUMMARY = {
  programs: 2,
  assets: { domain: 14892, ip: 4105, url: 86410, service: 9842 },
  findings_by_severity: { critical: 4, high: 18, medium: 42, low: 89, info: 156 },
  jobs_by_status: {
    pending_approval: 1,
    queued: 34,
    dispatched: 12,
    running: 8,
    completed: 2341,
    failed: 15,
    cancelled: 2,
  },
};

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

function stub(
  summary: () => Response = () => Response.json(SUMMARY),
  events: () => Response = () => Response.json(page([EVENT])),
) {
  const fetchMock = vi.fn((path: string) => {
    if (path === '/api/v1/dashboard/summary') return Promise.resolve(summary());
    if (path.startsWith('/api/v1/asset-events')) return Promise.resolve(events());
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

afterEach(() => vi.unstubAllGlobals());

describe('S02 dashboard', () => {
  it('reads the summary and the newest asset events', async () => {
    const fetchMock = stub();
    wrap();
    await screen.findByText('api.example.com');
    expect(paths(fetchMock)).toContain('/api/v1/dashboard/summary');
    expect(paths(fetchMock)).toContain('/api/v1/asset-events?sort=-created_at&limit=8');
  });

  it('shows each KPI with thousands separators', async () => {
    stub();
    wrap();
    expect(await screen.findByText('14,892')).toBeInTheDocument();
    expect(screen.getByText('86,410')).toBeInTheDocument();
    expect(screen.getByText('4,105')).toBeInTheDocument();
    expect(screen.getByText('9,842')).toBeInTheDocument();
    expect(screen.getByText(/across 2 programs/)).toBeInTheDocument();
  });

  it('breaks jobs into all seven statuses with the shared labels', async () => {
    stub();
    const { container } = wrap();
    await screen.findByText('2,341');
    const tiles = Array.from(container.querySelectorAll('[data-breakdown]'));
    const keys = tiles.map((t) => t.getAttribute('data-breakdown'));
    expect(keys).toEqual([
      'critical',
      'high',
      'medium',
      'low',
      'info',
      // The mockup leads the job tiles with Total Jobs.
      'total',
      'pending_approval',
      'queued',
      'dispatched',
      'running',
      'completed',
      'failed',
      'cancelled',
    ]);
    // Total jobs is the sum of the seven statuses: 1 + 34 + 12 + 8 + 2,341 + 15 + 2.
    expect(within(tiles[5] as HTMLElement).getByText('Total jobs')).toBeInTheDocument();
    expect(within(tiles[5] as HTMLElement).getByText('2,413')).toBeInTheDocument();
    const pending = tiles[6] as HTMLElement;
    expect(within(pending).getByText('Pending approval')).toBeInTheDocument();
    expect(within(tiles[0] as HTMLElement).getByText('Critical')).toBeInTheDocument();
    expect(within(tiles[4] as HTMLElement).getByText('Info')).toBeInTheDocument();
  });

  it('describes an asset event in words and the pinned date format', async () => {
    stub();
    wrap();
    const row = (await screen.findByText('api.example.com')).closest('[data-activity]');
    expect(row).toHaveTextContent('Discovered domain api.example.com under program Example Corp');
    expect(row).toHaveTextContent('04/11/2026 08:05');
  });

  it('renders untrusted asset names as text, never as markup', async () => {
    stub(undefined, () =>
      Response.json(page([{ ...EVENT, asset_name: '<img src=x onerror=alert(1)>' }])),
    );
    const { container } = wrap();
    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('says the feed is empty rather than showing nothing', async () => {
    stub(undefined, () => Response.json(page([])));
    wrap();
    expect(await screen.findByText(/no asset events yet/i)).toBeInTheDocument();
  });

  it('reports a failed summary in its own words, not the backend title', async () => {
    stub(() => problem(500));
    wrap();
    const alerts = await screen.findAllByRole('alert');
    expect(alerts[0]).toHaveTextContent(/could not load the dashboard figures/i);
    expect(screen.queryByText('Internal Server Error')).toBeNull();
    expect(screen.getAllByText('Unavailable')).toHaveLength(5);
  });

  it('reports a failed feed without hiding the figures', async () => {
    stub(undefined, () => problem(500));
    wrap();
    expect(await screen.findByRole('alert')).toHaveTextContent(/recent activity/i);
    expect(await screen.findByText('14,892')).toBeInTheDocument();
  });

  it('reloads both sources on Refresh', async () => {
    const fetchMock = stub();
    wrap();
    await screen.findByText('api.example.com');
    const before = fetchMock.mock.calls.length;
    await userEvent.click(screen.getByRole('button', { name: /refresh/i }));
    await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBe(before + 2));
  });

  it('builds none of the dropped mockup parts', async () => {
    stub();
    const { container } = wrap();
    await screen.findByText('14,892');
    const text = container.textContent ?? '';
    for (const banned of [
      'SYNCED',
      'Auto-refreshes',
      '24h',
      'Top Programs',
      'Top Open Ports',
      'Staging Snapshot',
      'stream::',
      'this week',
      'today',
    ]) {
      expect(text).not.toContain(banned);
    }
  });
});
