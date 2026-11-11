import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type DomainNav, domainKeys } from '@/lib/domains';

import {
  ME_ADMIN,
  page,
  paths,
  problem,
  renderWithClient,
  stubFetch,
  TOOL_MODULES,
} from '../test-support';
import { DETAIL, detailRoutes, JOB } from './fixtures';
import DomainDetailPage from './page';

const push = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ domainId: DETAIL.id }),
}));

/** Renders as if opened from S04, whose page of rows sits in the cache. */
function renderFromList(nav: DomainNav) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(domainKeys.nav, nav);
  return render(
    <QueryClientProvider client={client}>
      <DomainDetailPage />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

const ID = DETAIL.id;

describe('S05 domain detail', () => {
  it('reads the domain, its events, screenshots and findings by domain id', async () => {
    const fetchMock = stubFetch(detailRoutes());
    renderWithClient(<DomainDetailPage />);
    expect(await screen.findByRole('heading', { name: /auth\.example\.com/ })).toBeInTheDocument();
    await screen.findAllByText('OAuth open redirect');
    const seen = paths(fetchMock);
    expect(seen).toContain(`/api/v1/domains/${ID}`);
    expect(seen).toContain(`/api/v1/domains/${ID}/activity?limit=10`);
    expect(seen).toContain(`/api/v1/asset-events?domain_id=${ID}&sort=created_at&limit=1`);
    expect(seen).toContain(`/api/v1/screenshots?domain_id=${ID}&sort=-captured_at&limit=25`);
    expect(seen).toContain(`/api/v1/findings?domain_id=${ID}&limit=1`);
    expect(screen.getByText(ID)).toBeInTheDocument();
  });

  it('names the discovery source by the tool module of the discovering job', async () => {
    const fetchMock = stubFetch(detailRoutes());
    renderWithClient(<DomainDetailPage />);
    expect(await screen.findAllByText('nuclei', { selector: 'span' })).not.toHaveLength(0);
    expect(screen.getByText('Discovery source').nextElementSibling).toHaveTextContent('nuclei');
    expect(paths(fetchMock)).toContain('/api/v1/jobs/j1');
  });

  it('adds the tool version the worker reported to the discovery source', async () => {
    stubFetch({
      ...detailRoutes(),
      '/api/v1/jobs/j1': { ...JOB, tool_module_name: 'subfinder', tool_version: 'v2.6.4' },
    });
    renderWithClient(<DomainDetailPage />);
    await vi.waitFor(() =>
      expect(screen.getByText('Discovery source').nextElementSibling).toHaveTextContent(
        'subfinder (v2.6.4)',
      ),
    );
  });

  it('shows the unified activity with each tool, titles as text', async () => {
    stubFetch(detailRoutes());
    renderWithClient(<DomainDetailPage />);
    expect(await screen.findByText('<b>dns_status</b> changed')).toBeInTheDocument();
    expect(screen.getByText('3 events')).toBeInTheDocument();
    for (const label of ['Finding', 'Asset event', 'Screenshot'])
      expect(screen.getByText(label, { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('dnsx')).toBeInTheDocument();
    expect(document.querySelector('b')).toBeNull();
  });

  it('notes responding addresses, endpoints, ports and the latest status on the tiles', async () => {
    stubFetch(detailRoutes());
    const { container } = renderWithClient(<DomainDetailPage />);
    await screen.findByRole('heading', { name: /auth\.example\.com/ });
    await screen.findByText('1 of 2 responding');
    const tiles = Array.from(container.querySelectorAll('[data-stat-tile]')).map(
      (t) => t.textContent ?? '',
    );
    expect(tiles[1]).toContain('2 unique endpoints · 1 API');
    expect(tiles[2]).toContain('80, 443, 8080, 8443');
    expect(await screen.findByText('Latest HTTP 200')).toBeInTheDocument();
    expect(screen.getByText('A Record')).toBeInTheDocument();
  });

  it('counts the scan history on its tab', async () => {
    stubFetch(detailRoutes());
    renderWithClient(<DomainDetailPage />);
    expect(await screen.findByRole('tab', { name: /^scan history\s*\(1\)$/i })).toBeInTheDocument();
  });

  it('steps to the neighbours of the S04 page it was opened from', async () => {
    stubFetch(detailRoutes());
    renderFromList({ ids: ['d0', ID, 'd2'], start: 26, total: 64, totalIsEstimate: false });
    const stepper = await screen.findByRole('navigation', { name: 'Domain navigation' });
    expect(stepper).toHaveTextContent('27 / 64');
    expect(within(stepper).getByRole('link', { name: /previous/i })).toHaveAttribute(
      'href',
      '/domains/d0',
    );
    expect(within(stepper).getByRole('link', { name: /next/i })).toHaveAttribute(
      'href',
      '/domains/d2',
    );
  });

  it('hides the stepper when opened directly', async () => {
    stubFetch(detailRoutes());
    renderWithClient(<DomainDetailPage />);
    await screen.findByRole('heading', { name: /auth\.example\.com/ });
    expect(screen.queryByRole('navigation', { name: 'Domain navigation' })).toBeNull();
  });

  it('lets an Admin delete the domain after confirming, then returns to S04', async () => {
    const fetchMock = stubFetch(
      {
        ...detailRoutes(),
        [`/api/v1/domains/${ID}`]: (path: string, init?: RequestInit) =>
          init?.method === 'DELETE' ? new Response(null, { status: 204 }) : DETAIL,
      },
      ME_ADMIN,
    );
    renderWithClient(<DomainDetailPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/domains'));
    expect(
      fetchMock.mock.calls.some(
        (c) => c[0] === `/api/v1/domains/${ID}` && c[1]?.method === 'DELETE',
      ),
    ).toBe(true);
  });

  it('hides Delete from a User', async () => {
    stubFetch(detailRoutes());
    renderWithClient(<DomainDetailPage />);
    await screen.findByRole('heading', { name: /auth\.example\.com/ });
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('adds a tag from the catalogue and removes one', async () => {
    const fetchMock = stubFetch({
      ...detailRoutes(),
      '/api/v1/asset-tags': (path: string, init?: RequestInit) =>
        init?.method === 'DELETE' ? new Response(null, { status: 204 }) : { id: 'at9' },
    });
    renderWithClient(<DomainDetailPage />);
    await screen.findByRole('heading', { name: /auth\.example\.com/ });
    const choose = screen.getByLabelText('Tag to add');
    // Only tags the domain does not carry yet are offered.
    await within(choose).findByRole('option', { name: 'owner: web' });
    expect(within(choose).queryByRole('option', { name: 'env: prod' })).toBeNull();
    await userEvent.selectOptions(choose, 'tg4');
    await userEvent.click(screen.getByRole('button', { name: 'Add tag' }));
    await vi.waitFor(() => {
      const post = fetchMock.mock.calls.find(
        (c) => c[0] === '/api/v1/asset-tags' && c[1]?.method === 'POST',
      );
      expect(JSON.parse(String(post?.[1]?.body))).toEqual({ tag_id: 'tg4', domain_id: ID });
    });

    await userEvent.click(screen.getByRole('button', { name: 'Remove tag tier: auth' }));
    await vi.waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          (c) => c[0] === '/api/v1/asset-tags/at2' && c[1]?.method === 'DELETE',
        ),
      ).toBe(true),
    );
  });

  it('creates a new tag, then puts it on the domain', async () => {
    const fetchMock = stubFetch({
      ...detailRoutes(),
      '/api/v1/tags': (path: string, init?: RequestInit) =>
        init?.method === 'POST'
          ? {
              id: 'tg9',
              key: 'team',
              value: 'red',
              created_by: null,
              created_at: '2026-11-05T00:00:00Z',
            }
          : page([]),
      '/api/v1/asset-tags': { id: 'at9' },
    });
    renderWithClient(<DomainDetailPage />);
    await screen.findByRole('heading', { name: /auth\.example\.com/ });
    await userEvent.type(screen.getByLabelText('New tag key'), 'team');
    await userEvent.type(screen.getByLabelText('New tag value'), 'red');
    await userEvent.click(screen.getByRole('button', { name: 'Create tag' }));
    await vi.waitFor(() => {
      const post = fetchMock.mock.calls.find(
        (c) => c[0] === '/api/v1/asset-tags' && c[1]?.method === 'POST',
      );
      expect(JSON.parse(String(post?.[1]?.body))).toEqual({ tag_id: 'tg9', domain_id: ID });
    });
    const created = fetchMock.mock.calls.find(
      (c) => c[0] === '/api/v1/tags' && c[1]?.method === 'POST',
    );
    expect(JSON.parse(String(created?.[1]?.body))).toEqual({ key: 'team', value: 'red' });
  });

  it('opens the other tabs and reads their lists', async () => {
    const fetchMock = stubFetch(detailRoutes());
    renderWithClient(<DomainDetailPage />);
    await screen.findByRole('heading', { name: /auth\.example\.com/ });

    await userEvent.click(screen.getByRole('tab', { name: /scan history/i }));
    expect(await screen.findByText('Completed')).toBeInTheDocument();
    expect(paths(fetchMock)).toContain(
      '/api/v1/jobs?target=auth.example.com&sort=-created_at&limit=25',
    );

    await userEvent.click(screen.getByRole('tab', { name: /^findings/i }));
    expect(await screen.findByText('New')).toBeInTheDocument();
    expect(paths(fetchMock)).toContain(`/api/v1/findings?domain_id=${ID}&limit=25`);

    await userEvent.click(screen.getByRole('tab', { name: /^urls/i }));
    expect(paths(fetchMock)).toContain(`/api/v1/urls?domain_id=${ID}&limit=25`);

    await userEvent.click(screen.getByRole('tab', { name: /^services/i }));
    expect(paths(fetchMock)).toContain(`/api/v1/services?domain_id=${ID}&limit=25`);

    await userEvent.click(screen.getByRole('tab', { name: /dns/i }));
    expect(screen.getByRole('list')).toHaveTextContent('198.51.100.25');

    await userEvent.click(screen.getByRole('tab', { name: /screenshots/i }));
    expect(await screen.findByRole('img', { name: /screenshot of https/i })).toHaveAttribute(
      'src',
      '/api/v1/screenshots/s1/image',
    );
  });

  it('dispatches the chosen tool modules with a priority in one request', async () => {
    const modules = [
      {
        ...TOOL_MODULES[0],
        title: 'Template Scan',
        description: 'Nuclei templates',
        estimated_seconds: 180,
      },
      {
        ...TOOL_MODULES[0],
        id: 't2',
        name: 'httpx',
        title: 'HTTP probe',
        description: '',
        estimated_seconds: 600,
      },
    ];
    const fetchMock = stubFetch({
      ...detailRoutes(),
      '/api/v1/tool-modules': page(modules),
      '/api/v1/jobs/bulk-create': { items: [] },
    });
    renderWithClient(<DomainDetailPage />);
    await screen.findByRole('heading', { name: /auth\.example\.com/ });
    const run = screen.getByRole('button', { name: /run scan/i });
    await vi.waitFor(() => expect(run).toBeEnabled());
    await userEvent.click(run);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('auth.example.com');
    await vi.waitFor(() => expect(dialog).toHaveTextContent('1 Active IP'));
    const dispatch = within(dialog).getByRole('button', { name: 'Dispatch Job' });
    expect(dispatch).toBeDisabled();
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /template scan/i }));
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /http probe/i }));
    expect(dialog).toHaveTextContent('Estimated: ~10 min');
    await userEvent.selectOptions(within(dialog).getByLabelText('Priority'), 'high');
    await userEvent.click(dispatch);
    await vi.waitFor(() => {
      const post = fetchMock.mock.calls.find((c) => c[0] === '/api/v1/jobs/bulk-create');
      expect(JSON.parse(String(post?.[1]?.body))).toEqual({
        program_id: 'p1',
        target: ['auth.example.com'],
        priority: 'high',
        items: [{ tool_module_id: 't1' }, { tool_module_id: 't2' }],
      });
    });
    expect(await screen.findByRole('status')).toHaveTextContent('2 jobs created.');
  });

  it('says a missing domain does not exist, in its own words', async () => {
    stubFetch({ [`/api/v1/domains/${ID}`]: () => problem(404) });
    renderWithClient(<DomainDetailPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This domain does not exist, or you cannot see it.',
    );
    expect(screen.queryByText('Backend title')).toBeNull();
  });

  it('reports any other failure as a load failure', async () => {
    stubFetch({ [`/api/v1/domains/${ID}`]: () => problem(500, 'internal') });
    renderWithClient(<DomainDetailPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the domain.');
  });
});
