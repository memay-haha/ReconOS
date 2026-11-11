import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import DomainsPage from './page';
import {
  ME_ADMIN,
  page,
  paths,
  problem,
  renderWithClient,
  stubFetch,
  TOOL_MODULES,
} from './test-support';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const COUNTS = { critical: 1, high: 0, medium: 2, low: 0, info: 0 };

function domain(id: string, name: string, programId = 'p1') {
  return {
    id,
    program_id: programId,
    name,
    apex: 'example.com',
    is_wildcard: false,
    cname: null,
    dns_status: 'resolved',
    in_scope: true,
    first_seen_at: '2026-10-12T07:22:00Z',
    last_seen_at: '2026-11-04T01:05:00Z',
    ips: ['198.51.100.24', '198.51.100.25'],
    url_count: 1234,
    service_count: 4,
    finding_counts: COUNTS,
  };
}

const ROWS = [domain('d1', 'auth.example.com'), domain('d2', 'api.example.org', 'p2')];

const SUMMARY = {
  total: 1500,
  in_scope: 1200,
  resolved: 1200,
  resolved_new_24h: 34,
  unresolved: 42,
  with_findings: 30,
  with_critical: 3,
  new_24h: 12,
  new_daily_avg_7d: 10,
};

/** S04's routes: the list, its summary, and anything a test adds. */
function routes(extra: Record<string, unknown> = {}) {
  return { '/api/v1/domains': page(ROWS), '/api/v1/domains/summary': SUMMARY, ...extra };
}

/** The list request is the one asking for a sort. */
function listPaths(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return paths(fetchMock).filter((p) => p.startsWith('/api/v1/domains?') && p.includes('sort='));
}

function bodyOf(fetchMock: ReturnType<typeof vi.fn>, path: string): unknown {
  const call = fetchMock.mock.calls.find((c) => c[0] === path);
  return call === undefined ? undefined : JSON.parse(String(call[1]?.body));
}

afterEach(() => {
  vi.unstubAllGlobals();
  // Hidden columns live in localStorage (src/lib/column-prefs.ts).
  window.localStorage.clear();
});

describe('S04 domains', () => {
  it('reads the first page sorted by name, and names each row by its program', async () => {
    const fetchMock = stubFetch(routes());
    renderWithClient(<DomainsPage />);
    expect(await screen.findByRole('link', { name: /^auth\.example\.com$/ })).toHaveAttribute(
      'href',
      '/domains/d1',
    );
    expect(listPaths(fetchMock)[0]).toBe('/api/v1/domains?sort=name&limit=25');
    expect(await screen.findByText('Example Org', { selector: 'td span' })).toBeInTheDocument();
    expect(screen.getAllByText('1,234')).toHaveLength(2);
    expect(screen.getAllByText('04/11/2026 08:05')).toHaveLength(2);
    expect(
      screen.getByRole('link', { name: 'Open auth.example.com in a new tab' }),
    ).toHaveAttribute('href', 'https://auth.example.com');
  });

  it('names every finding chip in words', async () => {
    stubFetch(routes());
    renderWithClient(<DomainsPage />);
    await screen.findByText('auth.example.com');
    expect(screen.getAllByRole('img', { name: '1 Critical' })).toHaveLength(2);
    expect(screen.getAllByRole('img', { name: '2 Medium' })).toHaveLength(2);
  });

  it('filters Unresolved as nxdomain and timeout, and restarts the cursor', async () => {
    const fetchMock = stubFetch(
      routes({
        '/api/v1/domains': (path: string) =>
          path.includes('cursor=c2') ? page([]) : page(ROWS, { next_cursor: 'c2', total: 60 }),
      }),
    );
    renderWithClient(<DomainsPage />);
    await screen.findByText('auth.example.com');
    for (const label of ['All', 'Resolved', 'Unresolved'])
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^next/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Unresolved' }));
    expect(listPaths(fetchMock).at(-1)).toBe(
      '/api/v1/domains?dns_status=nxdomain&dns_status=timeout&sort=name&limit=25',
    );
    expect(screen.getByRole('button', { name: 'Unresolved' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('searches, filters by program and findings, and the export carries the filters', async () => {
    const fetchMock = stubFetch(routes());
    renderWithClient(<DomainsPage />);
    await screen.findByText('auth.example.com');
    await screen.findByRole('option', { name: 'Example Corp' });
    expect(screen.getByRole('option', { name: 'All programs (2)' })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Program'), 'p1');
    await userEvent.click(screen.getByRole('switch', { name: 'Findings only' }));
    await userEvent.type(screen.getByLabelText('Filter domains'), '*.example.com');
    await vi.waitFor(() =>
      expect(listPaths(fetchMock).at(-1)).toBe(
        '/api/v1/domains?program_id=p1&q=*.example.com&has_findings=true&sort=name&limit=25',
      ),
    );
    expect(paths(fetchMock)).toContain(
      '/api/v1/domains/summary?program_id=p1&q=*.example.com&has_findings=true',
    );
    expect(screen.getByRole('link', { name: /export csv/i })).toHaveAttribute(
      'href',
      '/api/v1/domains/export?format=csv&program_id=p1&q=*.example.com&has_findings=true',
    );
  });

  it('sorts by name both ways from the Domain header', async () => {
    const fetchMock = stubFetch(routes());
    renderWithClient(<DomainsPage />);
    await screen.findByText('auth.example.com');
    await userEvent.click(screen.getByRole('button', { name: /^domain/i }));
    expect(listPaths(fetchMock).at(-1)).toBe('/api/v1/domains?sort=-name&limit=25');
    expect(screen.getByRole('columnheader', { name: /^domain/i })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
  });

  it('fills five tiles from the summary', async () => {
    const fetchMock = stubFetch(routes());
    const { container } = renderWithClient(<DomainsPage />);
    await screen.findByText('auth.example.com');
    const tiles = Array.from(container.querySelectorAll('[data-stat-tile]')) as HTMLElement[];
    expect(tiles).toHaveLength(5);
    await within(tiles[0] as HTMLElement).findByText('1,500');
    expect(tiles[0]).toHaveTextContent('80.0% in scope');
    expect(tiles[1]).toHaveTextContent('80.0%');
    expect(tiles[1]).toHaveTextContent('+34 today');
    expect(tiles[2]).toHaveTextContent('2.80%');
    expect(tiles[3]).toHaveTextContent('3 critical');
    expect(tiles[4]).toHaveTextContent('+20.0% vs avg');
    expect(paths(fetchMock)).toContain('/api/v1/domains/summary');
  });

  it('hides Add Scope from a User and shows it to an Admin', async () => {
    stubFetch(routes());
    const { unmount } = renderWithClient(<DomainsPage />);
    await screen.findByText('auth.example.com');
    expect(screen.queryByRole('link', { name: /add scope/i })).toBeNull();
    unmount();
    vi.unstubAllGlobals();
    stubFetch(routes(), ME_ADMIN);
    renderWithClient(<DomainsPage />);
    expect(await screen.findByRole('link', { name: /add scope/i })).toHaveAttribute(
      'href',
      '/manage',
    );
  });

  it('runs a scan only when the selected domains share one program', async () => {
    const fetchMock = stubFetch(routes({ '/api/v1/jobs/bulk-create': { items: [] } }));
    renderWithClient(<DomainsPage />);
    await screen.findByText('auth.example.com');
    await userEvent.click(screen.getByLabelText('Select auth.example.com'));
    const run = await screen.findByRole('button', { name: /run scan/i });
    await vi.waitFor(() => expect(run).toBeEnabled());
    await userEvent.click(screen.getByLabelText('Select api.example.org'));
    expect(screen.getByRole('button', { name: /run scan/i })).toBeDisabled();
    expect(screen.getByText(/one program/i)).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Select api.example.org'));
    await userEvent.click(screen.getByRole('button', { name: /run scan/i }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Example Corp');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /nuclei/i }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Dispatch Job' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Job created.');
    expect(bodyOf(fetchMock, '/api/v1/jobs/bulk-create')).toEqual({
      program_id: 'p1',
      target: ['auth.example.com'],
      priority: 'normal',
      items: [{ tool_module_id: TOOL_MODULES[0]?.id }],
    });
  });

  it('exports only the selected rows, in the chosen format', async () => {
    stubFetch(routes());
    renderWithClient(<DomainsPage />);
    await screen.findByText('auth.example.com');
    await userEvent.click(screen.getByLabelText('Select auth.example.com'));
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(screen.getByRole('link', { name: /json lines/i })).toHaveAttribute(
      'href',
      '/api/v1/domains/export?format=jsonl&ids=d1',
    );
  });

  it('tags the selected domains with one catalogue tag', async () => {
    const fetchMock = stubFetch(
      routes({
        '/api/v1/tags': page([
          { id: 'tg1', key: 'env', value: 'prod', created_by: null, created_at: '' },
        ]),
        '/api/v1/asset-tags/bulk-create': new Response(null, { status: 204 }),
      }),
    );
    renderWithClient(<DomainsPage />);
    await screen.findByText('auth.example.com');
    await userEvent.click(screen.getByLabelText('Select auth.example.com'));
    await userEvent.click(screen.getByLabelText('Select api.example.org'));
    await userEvent.click(screen.getByRole('button', { name: 'Tag' }));
    const choose = screen.getByLabelText('Tag 2 domains');
    await within(choose).findByRole('option', { name: 'env: prod' });
    await userEvent.selectOptions(choose, 'tg1');
    await userEvent.click(screen.getByRole('button', { name: 'Apply tag' }));
    await vi.waitFor(() =>
      expect(bodyOf(fetchMock, '/api/v1/asset-tags/bulk-create')).toEqual({
        tag_id: 'tg1',
        asset_type: 'domain',
        ids: ['d1', 'd2'],
      }),
    );
  });

  it('lets an Admin delete the selected domains after confirming; a User sees no Delete', async () => {
    stubFetch(routes());
    const { unmount } = renderWithClient(<DomainsPage />);
    await screen.findByText('auth.example.com');
    await userEvent.click(screen.getByLabelText('Select auth.example.com'));
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    unmount();
    vi.unstubAllGlobals();

    const fetchMock = stubFetch(
      routes({ '/api/v1/domains/bulk-delete': new Response(null, { status: 204 }) }),
      ME_ADMIN,
    );
    renderWithClient(<DomainsPage />);
    await screen.findByText('auth.example.com');
    await screen.findByRole('link', { name: /add scope/i });
    await userEvent.click(screen.getByLabelText('Select auth.example.com'));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Delete 1 domain?');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await vi.waitFor(() =>
      expect(bodyOf(fetchMock, '/api/v1/domains/bulk-delete')).toEqual({ ids: ['d1'] }),
    );
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByText(/items selected/)).toBeNull();
  });

  it('applies a saved filter preset and saves the current filters as one', async () => {
    const preset = {
      id: 'sf1',
      screen: 'domains',
      name: 'Unresolved with findings',
      params: { dns_status: ['nxdomain', 'timeout'], has_findings: true },
      created_at: '2026-11-01T02:00:00Z',
    };
    const fetchMock = stubFetch(
      routes({
        '/api/v1/saved-filters': (path: string, init?: RequestInit) =>
          init?.method === 'POST' ? { ...preset, id: 'sf2' } : page([preset]),
      }),
    );
    renderWithClient(<DomainsPage />);
    await screen.findByText('auth.example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Filter Presets' }));
    expect(paths(fetchMock)).toContain('/api/v1/saved-filters?screen=domains&sort=name&limit=200');
    await userEvent.click(await screen.findByRole('button', { name: 'Unresolved with findings' }));
    await vi.waitFor(() =>
      expect(listPaths(fetchMock).at(-1)).toBe(
        '/api/v1/domains?dns_status=nxdomain&dns_status=timeout&has_findings=true&sort=name&limit=25',
      ),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Filter Presets' }));
    await userEvent.type(screen.getByLabelText('Preset name'), 'Mine');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() =>
      expect(bodyOf(fetchMock, '/api/v1/saved-filters')).toEqual({
        screen: 'domains',
        name: 'Mine',
        params: { dns_status: ['nxdomain', 'timeout'], has_findings: true },
      }),
    );
  });

  it('hides a column and toggles compact rows', async () => {
    stubFetch(routes());
    renderWithClient(<DomainsPage />);
    await screen.findByText('auth.example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Columns' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Program' }));
    expect(screen.queryByRole('columnheader', { name: 'Program' })).toBeNull();
    const density = screen.getByRole('button', { name: 'Compact rows' });
    await userEvent.click(density);
    expect(density).toHaveAttribute('aria-pressed', 'true');
  });

  it('says the list is empty rather than drawing a bare table', async () => {
    stubFetch(routes({ '/api/v1/domains': page([]) }));
    renderWithClient(<DomainsPage />);
    expect(await screen.findByText(/no domains match/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('reports a failure in its own words, not the backend title', async () => {
    stubFetch(routes({ '/api/v1/domains': () => problem(500, 'internal') }));
    renderWithClient(<DomainsPage />);
    expect(await screen.findByText('Could not load the domains.')).toBeInTheDocument();
    expect(screen.queryByText('Backend title')).toBeNull();
  });
});
