import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { screenshotKeys } from '@/lib/screenshots';

import ScreenshotDetailPage from './page';

const push = vi.fn();
let currentId = 's2';
vi.mock('next/navigation', () => ({
  useParams: () => ({ screenshotId: currentId }),
  useRouter: () => ({ push }),
}));

const SHOT = {
  id: 's2',
  program_id: 'p1',
  url_id: 'u1',
  job_id: 'j1',
  raw_output_id: 'r1',
  final_url: 'https://auth.example.com/oauth/authorize',
  status_code: 200,
  title: 'Single Sign-On',
  perception_hash: 'abc',
  http_headers: { server: 'cloudflare', 'x-frame-options': 'DENY' },
  is_failed: false,
  error_message: null,
  captured_at: '2026-11-04T01:05:00Z',
};

const URL_DETAIL = {
  id: 'u1',
  program_id: 'p1',
  domain_id: 'd1',
  ip_id: null,
  url: 'https://auth.example.com/oauth/authorize',
  scheme: 'https',
  host: 'auth.example.com',
  port: 443,
  path: '/oauth/authorize',
  status_code: 200,
  title: 'Single Sign-On',
  content_length: 43827,
  content_type: 'text/html',
  webserver: 'nginx',
  in_scope: true,
  first_seen_at: '2026-11-01T00:00:00Z',
  last_seen_at: '2026-11-04T00:00:00Z',
  technologies: [
    { technology_id: 't1', name: 'Nginx', category: 'web server', version: '1.24.0' },
    { technology_id: 't2', name: 'React', category: 'framework', version: null },
  ],
};

function problem(status: number) {
  return new Response(JSON.stringify({ title: 'Not Found', status, code: 'not_found' }), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  });
}

function stub(
  shot: () => Response = () => Response.json(SHOT),
  url: () => Response = () => Response.json(URL_DETAIL),
) {
  const fetchMock = vi.fn((path: string) => {
    if (path.startsWith('/api/v1/screenshots/')) return Promise.resolve(shot());
    if (path.startsWith('/api/v1/urls/')) return Promise.resolve(url());
    return Promise.resolve(problem(404));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function wrap(seed?: (client: QueryClient) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  seed?.(client);
  return render(
    <QueryClientProvider client={client}>
      <ScreenshotDetailPage />
    </QueryClientProvider>,
  );
}

function galleryPage(ids: string[]) {
  return (client: QueryClient) =>
    client.setQueryData(screenshotKeys.list({ limit: 24 }, null), {
      items: ids.map((id) => ({ ...SHOT, id })),
      next_cursor: null,
      total: ids.length,
      total_is_estimate: false,
    });
}

beforeEach(() => {
  currentId = 's2';
  push.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe('S07 screenshot detail', () => {
  it('reads the screenshot, then its URL', async () => {
    const fetchMock = stub();
    wrap();
    await screen.findByText('Nginx');
    const paths = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(paths).toEqual(['/api/v1/screenshots/s2', '/api/v1/urls/u1']);
  });

  it('shows the uuid, status, size and capture time', async () => {
    stub();
    wrap();
    expect(await screen.findByText('ID: s2')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
    expect(await screen.findByText('42.8 KB')).toBeInTheDocument();
    expect(screen.getByText('04/11/2026 08:05')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Screenshot Detail');
  });

  it('draws the image from the image endpoint and offers it as a download', async () => {
    stub();
    wrap();
    const img = await screen.findByRole('img', {
      name: 'Screenshot of https://auth.example.com/oauth/authorize',
    });
    expect(img).toHaveAttribute('src', '/api/v1/screenshots/s2/image');
    expect(screen.getByRole('link', { name: /download png/i })).toHaveAttribute(
      'href',
      '/api/v1/screenshots/s2/image',
    );
  });

  it('lists the response headers and the detected technologies as text', async () => {
    stub();
    wrap();
    expect(await screen.findByText('x-frame-options')).toBeInTheDocument();
    expect(screen.getByText('DENY')).toBeInTheDocument();
    expect(await screen.findByText('Detected Technologies (2)')).toBeInTheDocument();
    expect(screen.getByText('1.24.0')).toBeInTheDocument();
    expect(screen.getByText('Version unknown')).toBeInTheDocument();
  });

  it('never links to a non-http final URL', async () => {
    stub(() => Response.json({ ...SHOT, final_url: 'javascript:alert(1)' }));
    const { container } = wrap();
    await screen.findByText('ID: s2');
    expect(screen.queryByRole('link', { name: /open live url/i })).toBeNull();
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
  });

  it('hides Previous and Next when opened straight from a link', async () => {
    stub();
    wrap();
    await screen.findByText('ID: s2');
    expect(screen.queryByRole('button', { name: /previous/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^next/i })).toBeNull();
  });

  it('walks the gallery page in the cache with Previous and Next', async () => {
    stub();
    wrap(galleryPage(['s1', 's2', 's3']));
    await screen.findByText('ID: s2');
    await userEvent.click(screen.getByRole('button', { name: /previous/i }));
    expect(push).toHaveBeenLastCalledWith('/screenshots/s1');
    await userEvent.click(screen.getByRole('button', { name: /^next/i }));
    expect(push).toHaveBeenLastCalledWith('/screenshots/s3');
  });

  it('disables Next on the last screenshot of the page', async () => {
    stub();
    wrap(galleryPage(['s1', 's2']));
    await screen.findByText('ID: s2');
    expect(screen.getByRole('button', { name: /^next/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /previous/i })).toBeEnabled();
  });

  it('shows the error message of a failed screenshot instead of an image', async () => {
    stub(() =>
      Response.json({
        ...SHOT,
        is_failed: true,
        status_code: null,
        title: null,
        http_headers: null,
        error_message: 'net::ERR_CONNECTION_TIMED_OUT',
      }),
    );
    wrap();
    expect(await screen.findByText('net::ERR_CONNECTION_TIMED_OUT')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByRole('link', { name: /download/i })).toBeNull();
    expect(screen.getByText('No response headers were recorded.')).toBeInTheDocument();
  });

  it('says a missing screenshot does not exist, without the backend title', async () => {
    stub(() => problem(404));
    wrap();
    expect(await screen.findByRole('alert')).toHaveTextContent(/does not exist/i);
    expect(screen.queryByText('Not Found')).toBeNull();
    expect(screen.getByRole('link', { name: /back to gallery/i })).toHaveAttribute(
      'href',
      '/screenshots',
    );
  });

  it('keeps the screenshot when its URL cannot be read', async () => {
    stub(undefined, () => problem(500));
    wrap();
    expect(await screen.findByRole('alert')).toHaveTextContent(/technologies/i);
    expect(screen.getByText('ID: s2')).toBeInTheDocument();
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
  });

  it('offers no delete control', async () => {
    stub();
    wrap();
    await screen.findByText('ID: s2');
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
  });
});
