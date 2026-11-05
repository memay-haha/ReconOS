import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import DomainsPage from './page';
import { ME_ADMIN, page, paths, problem, renderWithClient, stubFetch } from './test-support';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

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

/** The list request is the one asking for `sort=name`; tile requests ask for one row. */
function listPaths(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return paths(fetchMock).filter((p) => p.startsWith('/api/v1/domains?') && p.includes('sort='));
}

afterEach(() => vi.unstubAllGlobals());

describe('S04 domains', () => {
  it('reads the first page sorted by name, and names each row by its program', async () => {
    const fetchMock = stubFetch({ '/api/v1/domains': page(ROWS) });
    renderWithClient(<DomainsPage />);
    expect(await screen.findByRole('link', { name: 'auth.example.com' })).toHaveAttribute(
      'href',
      '/domains/d1',
    );
    expect(listPaths(fetchMock)[0]).toBe('/api/v1/domains?sort=name&limit=25');
    expect(await screen.findByText('Example Org', { selector: 'td span' })).toBeInTheDocument();
    expect(screen.getAllByText('1,234')).toHaveLength(2);
    expect(screen.getAllByText('04/11/2026 08:05')).toHaveLength(2);
  });

  it('names every finding chip in words', async () => {
    stubFetch({ '/api/v1/domains': page(ROWS) });
    renderWithClient(<DomainsPage />);
    await screen.findByText('auth.example.com');
    expect(screen.getAllByRole('img', { name: '1 Critical' })).toHaveLength(2);
    expect(screen.getAllByRole('img', { name: '2 Medium' })).toHaveLength(2);
  });

  it('filters by DNS status with the four schema values and restarts the cursor', async () => {
    const fetchMock = stubFetch({
      '/api/v1/domains': (path: string) =>
        path.includes('cursor=c2') ? page([]) : page(ROWS, { next_cursor: 'c2', total: 60 }),
    });
    renderWithClient(<DomainsPage />);
    await screen.findByText('auth.example.com');
    for (const label of ['All', 'Unknown', 'Resolved', 'NXDOMAIN', 'Timeout'])
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^next/i }));
    await userEvent.click(screen.getByRole('button', { name: 'NXDOMAIN' }));
    expect(listPaths(fetchMock).at(-1)).toBe(
      '/api/v1/domains?dns_status=nxdomain&sort=name&limit=25',
    );
    expect(screen.getByRole('button', { name: 'NXDOMAIN' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('filters by program and scope, and the export link carries the same filters', async () => {
    const fetchMock = stubFetch({ '/api/v1/domains': page(ROWS) });
    renderWithClient(<DomainsPage />);
    await screen.findByText('auth.example.com');
    await screen.findByRole('option', { name: 'Example Corp' });
    await userEvent.selectOptions(screen.getByLabelText('Program'), 'p1');
    await userEvent.selectOptions(screen.getByLabelText('Scope'), 'false');
    expect(listPaths(fetchMock).at(-1)).toBe(
      '/api/v1/domains?program_id=p1&in_scope=false&sort=name&limit=25',
    );
    expect(screen.getByRole('link', { name: /export csv/i })).toHaveAttribute(
      'href',
      '/api/v1/domains/export?format=csv&program_id=p1&in_scope=false',
    );
  });

  it('fills the tiles from the totals of one-row requests', async () => {
    const fetchMock = stubFetch({
      '/api/v1/domains': (path: string) => {
        if (path.includes('dns_status=resolved&limit=1')) return page([], { total: 1200 });
        if (path.includes('dns_status=nxdomain&limit=1')) return page([], { total: 30 });
        if (path.includes('dns_status=timeout&limit=1'))
          return page([], { total: 12, total_is_estimate: true });
        if (path.endsWith('limit=1')) return page([], { total: 1500 });
        return page(ROWS);
      },
    });
    const { container } = renderWithClient(<DomainsPage />);
    await screen.findByText('auth.example.com');
    const tiles = Array.from(container.querySelectorAll('[data-stat-tile]')) as HTMLElement[];
    expect(tiles).toHaveLength(3);
    expect(await within(tiles[0] as HTMLElement).findByText('1,500')).toBeInTheDocument();
    expect(await within(tiles[1] as HTMLElement).findByText('1,200')).toBeInTheDocument();
    expect(await within(tiles[2] as HTMLElement).findByText('~42')).toBeInTheDocument();
    expect(paths(fetchMock)).toContain('/api/v1/domains?limit=1');
  });

  it('hides Add Scope from a User and shows it to an Admin', async () => {
    stubFetch({ '/api/v1/domains': page(ROWS) });
    const { unmount } = renderWithClient(<DomainsPage />);
    await screen.findByText('auth.example.com');
    expect(screen.queryByRole('link', { name: /add scope/i })).toBeNull();
    unmount();
    vi.unstubAllGlobals();
    stubFetch({ '/api/v1/domains': page(ROWS) }, ME_ADMIN);
    renderWithClient(<DomainsPage />);
    expect(await screen.findByRole('link', { name: /add scope/i })).toHaveAttribute(
      'href',
      '/manage',
    );
  });

  it('runs a scan only when the selected domains share one program', async () => {
    const fetchMock = stubFetch({
      '/api/v1/domains': page(ROWS),
      '/api/v1/jobs': { id: 'j1', status: 'queued' },
    });
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
    expect(within(dialog).getByText('Program: Example Corp')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create job' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Job created.');
    const post = fetchMock.mock.calls.find((c) => c[0] === '/api/v1/jobs');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      program_id: 'p1',
      tool_module_id: 't1',
      target: ['auth.example.com'],
    });
  });

  it('says the list is empty rather than drawing a bare table', async () => {
    stubFetch({ '/api/v1/domains': page([]) });
    renderWithClient(<DomainsPage />);
    expect(await screen.findByText(/no domains match/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('reports a failure in its own words, not the backend title', async () => {
    stubFetch({ '/api/v1/domains': () => problem(500, 'internal') });
    renderWithClient(<DomainsPage />);
    expect(await screen.findByText('Could not load the domains.')).toBeInTheDocument();
    expect(screen.queryByText('Backend title')).toBeNull();
  });
});
