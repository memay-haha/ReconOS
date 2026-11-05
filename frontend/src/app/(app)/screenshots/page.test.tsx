import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ScreenshotsPage from './page';

const SHOT = {
  id: 's1',
  program_id: 'p1',
  url_id: 'u1',
  job_id: 'j1',
  raw_output_id: 'r1',
  final_url: 'https://auth.example.com/login',
  status_code: 200,
  title: 'Single Sign-On',
  perception_hash: 'abc',
  http_headers: { server: 'nginx' },
  is_failed: false,
  error_message: null,
  captured_at: '2026-11-04T01:05:00Z',
};

const FAILED = {
  ...SHOT,
  id: 's2',
  final_url: 'https://legacy.example.test:8443',
  status_code: null,
  title: null,
  perception_hash: null,
  http_headers: null,
  is_failed: true,
  error_message: 'net::ERR_CONNECTION_TIMED_OUT',
};

const PROGRAM = { id: 'p1', name: 'Example Corp' };

function page(items: unknown[], extra: Record<string, unknown> = {}) {
  return { items, next_cursor: null, total: items.length, total_is_estimate: false, ...extra };
}

function problem(status: number) {
  return new Response(JSON.stringify({ title: 'Forbidden', status }), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  });
}

function stub(shots: (path: string) => Response = () => Response.json(page([SHOT, FAILED]))) {
  const fetchMock = vi.fn((path: string) => {
    if (path.startsWith('/api/v1/programs')) return Promise.resolve(Response.json(page([PROGRAM])));
    if (path.startsWith('/api/v1/screenshots')) return Promise.resolve(shots(path));
    return Promise.resolve(problem(404));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function shotPaths(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls
    .map((c) => c[0] as string)
    .filter((p) => p.startsWith('/api/v1/screenshots'));
}

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ScreenshotsPage />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('S06 screenshot gallery', () => {
  it('reads the first page at the default density', async () => {
    const fetchMock = stub();
    wrap();
    await screen.findByText('Single Sign-On');
    expect(shotPaths(fetchMock)).toEqual(['/api/v1/screenshots?limit=24']);
  });

  it('loads each thumbnail from the image endpoint with an alt text', async () => {
    stub();
    wrap();
    const img = await screen.findByRole('img', {
      name: 'Screenshot of https://auth.example.com/login',
    });
    expect(img).toHaveAttribute('src', '/api/v1/screenshots/s1/image');
  });

  it('opens the detail screen from the card title', async () => {
    stub();
    wrap();
    const link = await screen.findByRole('link', { name: 'Single Sign-On' });
    expect(link).toHaveAttribute('href', '/screenshots/s1');
  });

  it('shows the error message on a failed card instead of an image', async () => {
    stub();
    wrap();
    const msg = await screen.findByText('net::ERR_CONNECTION_TIMED_OUT');
    const card = msg.closest('article') as HTMLElement;
    expect(within(card).getByText('Failed')).toBeInTheDocument();
    expect(within(card).queryByRole('img')).toBeNull();
    expect(within(card).getByRole('link', { name: 'Screenshot failed' })).toHaveAttribute(
      'href',
      '/screenshots/s2',
    );
  });

  it('links out only to http and https, and renders the title as text', async () => {
    stub(() =>
      Response.json(
        page([{ ...SHOT, id: 'x1', final_url: 'javascript:alert(1)', title: '<b>bold</b>' }, SHOT]),
      ),
    );
    const { container } = wrap();
    expect(await screen.findByText('<b>bold</b>')).toBeInTheDocument();
    expect(container.querySelector('b')).toBeNull();
    const out = Array.from(container.querySelectorAll('a[target=_blank]')).map((a) =>
      a.getAttribute('href'),
    );
    expect(out).toEqual(['https://auth.example.com/login']);
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
  });

  it('groups look-alikes with sort=perception_hash and goes back to the first page', async () => {
    const fetchMock = stub((path) =>
      Response.json(page([SHOT], path.includes('cursor=') ? {} : { next_cursor: 'c2', total: 2 })),
    );
    wrap();
    await screen.findByText('Single Sign-On');
    await userEvent.click(screen.getByRole('button', { name: /^next/i }));
    await vi.waitFor(() =>
      expect(shotPaths(fetchMock).at(-1)).toBe('/api/v1/screenshots?limit=24&cursor=c2'),
    );
    const group = screen.getByRole('button', { name: /group by similar/i });
    expect(group).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(group);
    expect(group).toHaveAttribute('aria-pressed', 'true');
    await vi.waitFor(() =>
      expect(shotPaths(fetchMock).at(-1)).toBe('/api/v1/screenshots?sort=perception_hash&limit=24'),
    );
  });

  it('narrows by program and clears back to everything', async () => {
    const fetchMock = stub();
    wrap();
    await screen.findByRole('option', { name: 'Example Corp' });
    await userEvent.selectOptions(screen.getByLabelText('Program'), 'p1');
    await vi.waitFor(() =>
      expect(shotPaths(fetchMock).at(-1)).toBe('/api/v1/screenshots?program_id=p1&limit=24'),
    );
    await userEvent.click(screen.getByRole('button', { name: /clear filters/i }));
    expect(screen.getByLabelText('Program')).toHaveValue('');
    expect(shotPaths(fetchMock).at(-1)).toBe('/api/v1/screenshots?limit=24');
  });

  it('hides failed captures with is_failed=false when Show Failed is off', async () => {
    const fetchMock = stub();
    wrap();
    const toggle = await screen.findByLabelText('Show Failed');
    expect(toggle).toBeChecked();
    await userEvent.click(toggle);
    await vi.waitFor(() =>
      expect(shotPaths(fetchMock).at(-1)).toBe('/api/v1/screenshots?limit=24&is_failed=false'),
    );
    await userEvent.click(screen.getByRole('button', { name: /clear filters/i }));
    expect(screen.getByLabelText('Show Failed')).toBeChecked();
  });

  it('sends the chosen density as limit', async () => {
    const fetchMock = stub();
    wrap();
    await screen.findByText('Single Sign-On');
    await userEvent.selectOptions(screen.getByLabelText('Density'), '48');
    await vi.waitFor(() =>
      expect(shotPaths(fetchMock).at(-1)).toBe('/api/v1/screenshots?limit=48'),
    );
  });

  it('says the gallery is empty rather than showing a bare grid', async () => {
    stub(() => Response.json(page([])));
    wrap();
    expect(await screen.findByText('No screenshots yet.')).toBeInTheDocument();
  });

  it('reports a failure without the backend title, and not as an empty gallery', async () => {
    stub(() => problem(403));
    wrap();
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load the screenshots/i);
    expect(screen.queryByText('No screenshots yet.')).toBeNull();
    expect(screen.queryByText('Forbidden')).toBeNull();
  });
});
