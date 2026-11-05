import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { page, paths, problem, renderWithClient, stubFetch } from '../test-support';
import { DETAIL, detailRoutes } from './fixtures';
import DomainDetailPage from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ domainId: DETAIL.id }),
}));

afterEach(() => vi.unstubAllGlobals());

const ID = DETAIL.id;

describe('S05 domain detail', () => {
  it('reads the domain, its events, screenshots and findings by domain id', async () => {
    const fetchMock = stubFetch(detailRoutes());
    renderWithClient(<DomainDetailPage />);
    expect(await screen.findByRole('heading', { name: /auth\.example\.com/ })).toBeInTheDocument();
    await screen.findByText('OAuth open redirect');
    const seen = paths(fetchMock);
    expect(seen).toContain(`/api/v1/domains/${ID}`);
    expect(seen).toContain(`/api/v1/asset-events?domain_id=${ID}&sort=-created_at&limit=10`);
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

  it('shows asset events with their diff as text', async () => {
    stubFetch(detailRoutes());
    renderWithClient(<DomainDetailPage />);
    expect(await screen.findByText('dns_status: "timeout" → "resolved"')).toBeInTheDocument();
    expect(screen.getByText('Changed')).toBeInTheDocument();
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

  it('creates a job for this domain in its program', async () => {
    const fetchMock = stubFetch({ ...detailRoutes(), '/api/v1/jobs': page([]) });
    renderWithClient(<DomainDetailPage />);
    await screen.findByRole('heading', { name: /auth\.example\.com/ });
    const run = screen.getByRole('button', { name: /run scan/i });
    await vi.waitFor(() => expect(run).toBeEnabled());
    await userEvent.click(run);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('textbox')).toHaveValue('auth.example.com');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create job' }));
    await vi.waitFor(() => {
      const post = fetchMock.mock.calls.find(
        (c) => c[0] === '/api/v1/jobs' && c[1]?.method === 'POST',
      );
      expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({
        program_id: 'p1',
        target: ['auth.example.com'],
      });
    });
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
