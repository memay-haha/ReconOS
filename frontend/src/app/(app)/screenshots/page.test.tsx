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
  similar_group: 4,
  similar_count: 3,
  technologies: [
    { name: 'React', category: 'framework' },
    { name: 'Nginx', category: 'web server' },
    { name: 'Cloudflare', category: 'CDN' },
    { name: 'Envoy', category: 'proxy' },
  ],
  retry_job_status: null,
  width: 1920,
  height: 1080,
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
  similar_group: null,
  similar_count: 1,
  technologies: [],
  width: null,
  height: null,
};

const PROGRAM = { id: 'p1', name: 'Example Corp' };
const GOWITNESS = { id: 'tm-gw', name: 'gowitness', group: 'recon', is_enabled: true };
const TECH = [
  { id: 't-react', name: 'React', category: 'framework' },
  { id: 't-nginx', name: 'Nginx', category: 'web server' },
];
const QUEUED_JOB = {
  id: 'job-queued-1',
  program_id: 'p1',
  tool_module_id: 'tm-gw',
  status: 'queued',
  target: ['https://ingress.example.com/', 'https://cdn.example.com/'],
  created_at: '2026-11-04T02:00:00Z',
};
const DONE_JOB = {
  ...QUEUED_JOB,
  id: 'job-done-1234',
  status: 'completed',
  finished_at: '2026-11-04T03:00:00Z',
};

function page(items: unknown[], extra: Record<string, unknown> = {}) {
  return { items, next_cursor: null, total: items.length, total_is_estimate: false, ...extra };
}

function problem(status: number) {
  return new Response(JSON.stringify({ title: 'Forbidden', status }), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  });
}

function stub(
  shots: (path: string) => Response = () => Response.json(page([SHOT, FAILED])),
  jobs: (path: string) => Response = () => Response.json(page([])),
) {
  const fetchMock = vi.fn((path: string, init?: RequestInit) => {
    if (path.startsWith('/api/v1/programs')) return Promise.resolve(Response.json(page([PROGRAM])));
    if (path.startsWith('/api/v1/screenshots/summary')) {
      return Promise.resolve(
        Response.json({ by_status_code: { '2xx': 264, '4xx': 38, '5xx': 0 } }),
      );
    }
    if (path.startsWith('/api/v1/screenshots')) return Promise.resolve(shots(path));
    if (path.startsWith('/api/v1/technologies')) return Promise.resolve(Response.json(page(TECH)));
    if (path.startsWith('/api/v1/tool-modules')) {
      return Promise.resolve(Response.json(page([GOWITNESS])));
    }
    if (path.startsWith('/api/v1/jobs')) {
      if (init?.method === 'POST') return Promise.resolve(Response.json(QUEUED_JOB));
      return Promise.resolve(jobs(path));
    }
    return Promise.resolve(problem(404));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Calls of the screenshot list, not of the summary. */
function shotPaths(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls
    .map((c) => c[0] as string)
    .filter((p) => p.startsWith('/api/v1/screenshots') && !p.includes('/summary'));
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
    expect(screen.getByRole('navigation', { name: 'Screenshot pagination' })).toHaveTextContent(
      'Showing 1–2 of 2 screenshots',
    );
  });

  it('loads each thumbnail from the image endpoint with an alt text', async () => {
    stub();
    wrap();
    const img = await screen.findByRole('img', {
      name: 'Screenshot of https://auth.example.com/login',
    });
    expect(img).toHaveAttribute('src', '/api/v1/screenshots/s1/image');
  });

  it('opens the detail screen from the card title with its place in the list', async () => {
    stub();
    wrap();
    const link = await screen.findByRole('link', { name: 'Single Sign-On' });
    expect(link).toHaveAttribute('href', '/screenshots/s1?at=1');
  });

  it('marks look-alikes with their group (M15) and lists three technologies', async () => {
    stub(() =>
      Response.json(
        page([
          SHOT,
          {
            ...SHOT,
            id: 's3',
            title: 'Lone',
            similar_group: null,
            similar_count: 1,
            technologies: [],
          },
        ]),
      ),
    );
    wrap();
    const card = (await screen.findByText('Single Sign-On')).closest('article') as HTMLElement;
    expect(within(card).getByText('Group #04 (3)')).toBeInTheDocument();
    expect(within(card).getByText('React')).toBeInTheDocument();
    expect(within(card).getByText('Cloudflare')).toBeInTheDocument();
    expect(within(card).queryByText('Envoy')).toBeNull();
    const lone = screen.getByText('Lone').closest('article') as HTMLElement;
    expect(within(lone).getByText('Unique')).toBeInTheDocument();
  });

  it('labels a card by its first technology category when it is not grouped (M16)', async () => {
    stub(() => Response.json(page([{ ...SHOT, similar_group: null, similar_count: 1 }])));
    wrap();
    const card = (await screen.findByText('Single Sign-On')).closest('article') as HTMLElement;
    expect(within(card).getByText('framework')).toBeInTheDocument();
  });

  it('marks a 5xx page with Traceback (M17)', async () => {
    stub(() => Response.json(page([{ ...SHOT, status_code: 502 }])));
    wrap();
    const card = (await screen.findByText('Single Sign-On')).closest('article') as HTMLElement;
    expect(within(card).getByText('Traceback')).toBeInTheDocument();
    expect(within(card).getByText('502 Bad Gateway')).toBeInTheDocument();
  });

  it('shows the error message on a failed card instead of an image', async () => {
    stub();
    wrap();
    const msg = await screen.findByText('net::ERR_CONNECTION_TIMED_OUT');
    const card = msg.closest('article') as HTMLElement;
    expect(within(card).getByText('Failed')).toBeInTheDocument();
    expect(within(card).getByText('Not retried')).toBeInTheDocument();
    expect(within(card).queryByRole('img')).toBeNull();
    expect(within(card).getByRole('link', { name: 'Screenshot failed' })).toHaveAttribute(
      'href',
      '/screenshots/s2?at=2',
    );
  });

  it('creates a gowitness job for the final URL with Force Dispatch (N18)', async () => {
    const fetchMock = stub();
    wrap();
    const card = (await screen.findByText('net::ERR_CONNECTION_TIMED_OUT')).closest(
      'article',
    ) as HTMLElement;
    const button = within(card).getByRole('button', { name: 'Force Dispatch' });
    await vi.waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    await vi.waitFor(() => {
      const post = fetchMock.mock.calls.find(
        (c) => c[0] === '/api/v1/jobs' && (c[1] as RequestInit | undefined)?.method === 'POST',
      );
      expect(JSON.parse(String((post?.[1] as RequestInit).body))).toEqual({
        program_id: 'p1',
        tool_module_id: 'tm-gw',
        target: ['https://legacy.example.test:8443'],
      });
    });
  });

  it('cannot dispatch again while a retry is pending', async () => {
    stub(() => Response.json(page([{ ...FAILED, retry_job_status: 'queued' }])));
    wrap();
    const card = (await screen.findByText('net::ERR_CONNECTION_TIMED_OUT')).closest(
      'article',
    ) as HTMLElement;
    expect(within(card).getByText('Retry pending')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Force Dispatch' })).toBeDisabled();
  });

  it('leads the first page with gowitness jobs still waiting (N16)', async () => {
    const fetchMock = stub(undefined, () => Response.json(page([QUEUED_JOB])));
    wrap();
    expect(await screen.findByText('Screenshot job queued')).toBeInTheDocument();
    expect(screen.getByText(/ingress\.example\.com\/ \+1 more/)).toBeInTheDocument();
    const jobCall = fetchMock.mock.calls
      .map((c) => c[0] as string)
      .find((p) => p.startsWith('/api/v1/jobs'));
    expect(jobCall).toBe(
      '/api/v1/jobs?tool_module_id=tm-gw&status=queued&status=dispatched&status=running&sort=-created_at&limit=4',
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
    // The second page numbers its cards after the first page.
    expect(await screen.findByRole('link', { name: 'Single Sign-On' })).toHaveAttribute(
      'href',
      '/screenshots/s1?at=25',
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

  it('searches page title or URL with q', async () => {
    const fetchMock = stub();
    wrap();
    await screen.findByText('Single Sign-On');
    await userEvent.type(
      screen.getByRole('searchbox', { name: /search page title or url/i }),
      'auth',
    );
    await vi.waitFor(() =>
      expect(shotPaths(fetchMock).at(-1)).toBe('/api/v1/screenshots?q=auth&limit=24'),
    );
  });

  it('shows a chip per status class with screenshots and filters by it (M14)', async () => {
    const fetchMock = stub();
    wrap();
    const chip = await screen.findByRole('button', { name: /2xx/ });
    expect(chip).toHaveTextContent('264');
    expect(screen.getByRole('button', { name: /4xx/ })).toHaveTextContent('38');
    expect(screen.queryByRole('button', { name: /5xx/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /3xx/ })).toBeNull();
    await userEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    await vi.waitFor(() =>
      expect(shotPaths(fetchMock).at(-1)).toBe('/api/v1/screenshots?status_code=2xx&limit=24'),
    );
    // The summary never takes status_code, so the other chips keep their counts.
    const summaries = fetchMock.mock.calls
      .map((c) => c[0] as string)
      .filter((p) => p.includes('/summary'));
    expect(summaries.every((p) => !p.includes('status_code'))).toBe(true);
  });

  it('filters by the technologies picked in the multi-select', async () => {
    const fetchMock = stub();
    wrap();
    await screen.findByText('Single Sign-On');
    const trigger = screen.getByRole('button', { name: /technologies/i });
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole('checkbox', { name: /react/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: /nginx/i }));
    await vi.waitFor(() =>
      expect(shotPaths(fetchMock).at(-1)).toBe(
        '/api/v1/screenshots?technology_id=t-react&technology_id=t-nginx&limit=24',
      ),
    );
    expect(screen.getByText('React, Nginx')).toBeInTheDocument();
  });

  it('loads one gowitness scan with job_id (N15)', async () => {
    const fetchMock = stub(undefined, () => Response.json(page([DONE_JOB])));
    wrap();
    await screen.findByText('Single Sign-On');
    const load = screen.getByRole('button', { name: 'Load Scan' });
    await vi.waitFor(() => expect(load).toBeEnabled());
    await userEvent.click(load);
    await userEvent.click(await screen.findByRole('button', { name: /job job-done/i }));
    await vi.waitFor(() =>
      expect(shotPaths(fetchMock).at(-1)).toBe('/api/v1/screenshots?job_id=job-done-1234&limit=24'),
    );
    await userEvent.click(screen.getByRole('button', { name: /stop showing only job/i }));
    await vi.waitFor(() =>
      expect(shotPaths(fetchMock).at(-1)).toBe('/api/v1/screenshots?limit=24'),
    );
  });

  it('hides failed screenshots with is_failed=false when Show Failed is off', async () => {
    const fetchMock = stub();
    wrap();
    const toggle = await screen.findByLabelText('Show Failed');
    expect(toggle).toBeChecked();
    await userEvent.click(toggle);
    await vi.waitFor(() =>
      expect(shotPaths(fetchMock).at(-1)).toBe('/api/v1/screenshots?is_failed=false&limit=24'),
    );
    await userEvent.click(screen.getByRole('button', { name: /clear filters/i }));
    expect(screen.getByLabelText('Show Failed')).toBeChecked();
  });

  it('sends the chosen density as limit', async () => {
    const fetchMock = stub();
    wrap();
    await screen.findByText('Single Sign-On');
    await userEvent.selectOptions(screen.getByLabelText('Density:'), '48');
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
