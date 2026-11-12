import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { screenshotKeys } from '@/lib/screenshots';

import ScreenshotDetailPage from './page';

const push = vi.fn();
let currentId = 's2';
let currentSearch = '';
vi.mock('next/navigation', () => ({
  useParams: () => ({ screenshotId: currentId }),
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(currentSearch),
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
  http_headers: {
    server: 'cloudflare',
    'x-frame-options': 'DENY',
    'set-cookie': ['__Host-session_id=SECRETVALUE; Path=/; HttpOnly', 'theme=dark'],
    'cf-ray': '8c9735a2981-IAD',
  },
  is_failed: false,
  error_message: null,
  captured_at: '2026-11-04T01:05:00Z',
  similar_group: null,
  similar_count: 1,
  technologies: [{ name: 'Nginx', category: 'web server' }],
  retry_job_status: null,
  width: 1920,
  height: 1080,
  worker_name: 'gowitness-02',
  device_scale: 2,
  remote_ip: '198.51.100.24',
  duration_ms: 2480,
  tls: {
    protocol: 'TLS 1.3',
    cipher: 'TLS_AES_256_GCM_SHA384',
    issuer: "Let's Encrypt Authority R3",
    subject: 'auth.example.com',
    san: ['auth.example.com', 'sso.example.com'],
    not_before: '2026-08-15T00:00:00Z',
    not_after: '2026-11-15T00:00:00Z',
  },
  console_log: [
    { level: 'info', message: 'App initialized.', at: null },
    { level: 'warn', message: 'GET /favicon.ico returned 404.', at: null },
  ],
  cookies: [
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
      name: 'theme_mode',
      domain: null,
      path: '/',
      expires: null,
      secure: false,
      http_only: false,
      same_site: null,
    },
  ],
  html_size: 43827,
  html_sha256: '74d82b4510ad6714c1e45903bda91',
  security_headers: {
    'strict-transport-security': false,
    'content-security-policy': false,
    'x-frame-options': true,
    'x-content-type-options': false,
    'permissions-policy': false,
  },
  security_headers_passed: 1,
  security_headers_total: 5,
};

const NETWORK = Array.from({ length: 8 }, (_, i) => ({
  method: 'GET',
  url: `https://auth.example.com/asset-${String(i)}.js`,
  status_code: i === 7 ? 404 : 200,
  content_type: 'application/javascript',
  size_bytes: 1024,
  duration_ms: 10,
  remote_ip: '198.51.100.24',
}));

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

const HTML = '<!DOCTYPE html>\n<html><body><script>alert(1)</script><b>bold</b></body></html>';

function problem(status: number) {
  return new Response(JSON.stringify({ title: 'Not Found', status, code: 'not_found' }), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  });
}

function stub(
  shot: () => Response = () => Response.json(SHOT),
  url: () => Response = () => Response.json(URL_DETAIL),
  role = 'admin',
) {
  const fetchMock = vi.fn((path: string, init?: RequestInit) => {
    if (path === '/api/v1/auth/me') {
      return Promise.resolve(Response.json({ id: 'me', username: 'me', display_name: 'Me', role }));
    }
    if (path.endsWith('/network')) {
      return Promise.resolve(Response.json({ network_log: NETWORK }));
    }
    if (path.endsWith('/html')) {
      return Promise.resolve(new Response(HTML, { headers: { 'content-type': 'text/plain' } }));
    }
    if (path.startsWith('/api/v1/screenshots/')) {
      if (init?.method === 'DELETE') return Promise.resolve(new Response(null, { status: 204 }));
      return Promise.resolve(shot());
    }
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

function galleryPage(ids: string[], total = ids.length) {
  return (client: QueryClient) =>
    client.setQueryData(screenshotKeys.list({ limit: 24 }, null), {
      items: ids.map((id) => ({ ...SHOT, id })),
      next_cursor: null,
      total,
      total_is_estimate: false,
    });
}

beforeEach(() => {
  currentId = 's2';
  currentSearch = '';
  push.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe('S07 screenshot detail', () => {
  it('reads the screenshot and its network log, then its URL', async () => {
    const fetchMock = stub();
    wrap();
    await screen.findByText('1.24.0');
    const paths = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(paths).toEqual(
      expect.arrayContaining([
        '/api/v1/screenshots/s2',
        '/api/v1/screenshots/s2/network',
        '/api/v1/urls/u1',
      ]),
    );
    // The HTML is read only when the reader opens it.
    expect(paths.some((p) => p.endsWith('/html'))).toBe(false);
  });

  it('summarises status, size, duration, worker and remote IP (D1, M18)', async () => {
    stub();
    wrap();
    expect(await screen.findByText('ID: s2')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Screenshot Detail');
    expect(screen.getByText('42.8 KB')).toBeInTheDocument();
    expect(screen.getByText('2.48 seconds')).toBeInTheDocument();
    expect(screen.getByText('gowitness-02')).toBeInTheDocument();
    expect(screen.getByText('198.51.100.24', { selector: 'span.rounded-sm' })).toBeInTheDocument();
    expect(screen.getByText(/Taken 04\/11\/2026 08:05/)).toBeInTheDocument();
    expect(screen.getAllByText('1920×1080 @ 2x').length).toBeGreaterThan(0);
    expect(screen.getByText('Viewport 1920×1080 @ 2x')).toBeInTheDocument();
  });

  it('counts requests, logs, headers, technologies and cookies', async () => {
    stub();
    wrap();
    const requests = (await screen.findByText('Requests')).closest('div.rounded-sm') as HTMLElement;
    await within(requests).findByText('8');
    expect(within(requests).getByText('7 2xx OK')).toBeInTheDocument();
    const logs = screen.getByText('Logs').closest('div.rounded-sm') as HTMLElement;
    expect(within(logs).getByText('1 warn')).toBeInTheDocument();
    const cookies = screen
      .getByText('Cookies', { selector: 'dt span' })
      .closest('div.rounded-sm') as HTMLElement;
    expect(within(cookies).getByText('1 HttpOnly')).toBeInTheDocument();
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

  it('checks the security headers the backend counted (M19)', async () => {
    stub();
    wrap();
    expect(await screen.findByText('1 / 5 Present')).toBeInTheDocument();
    expect(screen.getByText('X-Frame-Options:')).toBeInTheDocument();
    expect(screen.getAllByText('Missing')).toHaveLength(4);
  });

  it('shows the key headers first, set-cookie as names only (M20, G7)', async () => {
    const { container } = (stub(), wrap());
    expect(await screen.findByText('x-frame-options')).toBeInTheDocument();
    expect(screen.getByText('3 of 4 shown')).toBeInTheDocument();
    expect(screen.queryByText('cf-ray')).toBeNull();
    expect(screen.getByText('__Host-session_id, theme')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show all headers' }));
    expect(screen.getByText('cf-ray')).toBeInTheDocument();
    expect(container.textContent).not.toContain('SECRETVALUE');
  });

  it('lists the detected technologies as text', async () => {
    stub();
    wrap();
    expect(await screen.findByText('Detected Technologies (2)')).toBeInTheDocument();
    expect(screen.getByText('1.24.0')).toBeInTheDocument();
    expect(screen.getByText('Version unknown')).toBeInTheDocument();
  });

  it('shows the TLS certificate (D1)', async () => {
    stub();
    wrap();
    expect(await screen.findByText("Let's Encrypt Authority R3")).toBeInTheDocument();
    expect(screen.getByText('TLS 1.3 / TLS_AES_256_GCM_SHA384')).toBeInTheDocument();
    expect(screen.getByText('sso.example.com')).toBeInTheDocument();
  });

  it('shows the top 6 network events, then all of them', async () => {
    stub();
    wrap();
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(7);
    expect(screen.getByText(/Showing top 6 of 8 network events/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show all network events' }));
    expect(within(table).getAllByRole('row')).toHaveLength(9);
  });

  it('switches to the console log and the cookies, with names and flags only (D1)', async () => {
    const { container } = (stub(), wrap());
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('tab', { name: /console log/i }));
    expect(screen.getByText('GET /favicon.ico returned 404.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /cookies/i }));
    expect(screen.getByRole('tab', { name: /cookies/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('HttpOnly | Secure | SameSite=Strict')).toBeInTheDocument();
    expect(screen.getByText('Client Readable')).toBeInTheDocument();
    expect(container.textContent).not.toContain('SECRETVALUE');
  });

  it('offers the HAR export and the raw output as downloads', async () => {
    stub();
    wrap();
    expect(await screen.findByRole('link', { name: 'HAR 1.2 Export' })).toHaveAttribute(
      'href',
      '/api/v1/screenshots/s2/har',
    );
    expect(screen.getByRole('link', { name: 'Export Raw Output' })).toHaveAttribute(
      'href',
      '/api/v1/raw-outputs/r1/content',
    );
  });

  it('shows the page HTML as plain text, never rendered (D1)', async () => {
    stub();
    const { container } = wrap();
    await userEvent.click(await screen.findByRole('button', { name: /view page html source/i }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument();
    expect(container.ownerDocument.querySelector('b')).toBeNull();
    expect(container.ownerDocument.querySelector('script')).toBeNull();
    expect(within(dialog).getByText(/SHA256: 74d82b45/)).toBeInTheDocument();
    expect(within(dialog).getByText(/\(2 lines\)/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
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
    expect(screen.queryByRole('button', { name: /^prev/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^next/i })).toBeNull();
  });

  it('walks the gallery page in the cache with Previous, Next and the arrow keys', async () => {
    currentSearch = 'at=26';
    stub();
    wrap(galleryPage(['s1', 's2', 's3'], 312));
    await screen.findByText('ID: s2');
    expect(screen.getByText(/\/ 312 screenshots/)).toHaveTextContent('26 / 312 screenshots');
    await userEvent.click(screen.getByRole('button', { name: /^prev/i }));
    expect(push).toHaveBeenLastCalledWith('/screenshots/s1?at=25');
    await userEvent.click(screen.getByRole('button', { name: /^next/i }));
    expect(push).toHaveBeenLastCalledWith('/screenshots/s3?at=27');
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    expect(push).toHaveBeenLastCalledWith('/screenshots/s1?at=25');
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(push).toHaveBeenLastCalledWith('/screenshots/s3?at=27');
  });

  it('disables Next on the last screenshot of the page', async () => {
    stub();
    wrap(galleryPage(['s1', 's2']));
    await screen.findByText('ID: s2');
    expect(screen.getByRole('button', { name: /^next/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^prev/i })).toBeEnabled();
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
        tls: null,
        html_size: null,
      }),
    );
    wrap();
    expect(await screen.findByText('net::ERR_CONNECTION_TIMED_OUT')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByRole('link', { name: /download/i })).toBeNull();
    expect(screen.getByText('No response headers were recorded.')).toBeInTheDocument();
    expect(screen.getByText('No TLS session was recorded for this page.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /view page html source/i })).toBeNull();
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
  });

  it('soft-deletes after a confirmation, for Admin (D5)', async () => {
    const fetchMock = stub();
    wrap();
    await userEvent.click(await screen.findByRole('button', { name: /delete screenshot/i }));
    const dialog = screen.getByRole('dialog');
    expect(
      fetchMock.mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === 'DELETE'),
    ).toBe(false);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete Screenshot' }));
    await vi.waitFor(() => expect(push).toHaveBeenLastCalledWith('/screenshots'));
    const call = fetchMock.mock.calls.find(
      (c) => (c[1] as RequestInit | undefined)?.method === 'DELETE',
    );
    expect(call?.[0]).toBe('/api/v1/screenshots/s2');
  });

  it('offers no delete control to a User', async () => {
    stub(undefined, undefined, 'user');
    wrap();
    await screen.findByText('ID: s2');
    await screen.findByText('1.24.0');
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
  });
});
