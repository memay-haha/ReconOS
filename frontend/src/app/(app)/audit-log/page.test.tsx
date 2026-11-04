import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import AuditLogPage from './page';

const ROW = {
  id: 'a1',
  user_id: '1',
  action: 'user_created',
  resource_type: 'user',
  resource_id: '2',
  detail: null,
  ip_address: '203.0.113.9',
  created_at: '2026-11-04T01:05:00Z',
};

function page(items: unknown[]) {
  return { items, next_cursor: null, total: items.length, total_is_estimate: false };
}

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuditLogPage />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

function paths(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map((c) => c[0] as string);
}

describe('S14 audit log', () => {
  it('reads the whole log with no filter', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(page([ROW])));
    vi.stubGlobal('fetch', fetchMock);
    wrap();
    await screen.findByText('user_created');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/audit-logs');
  });

  it('renders the moment in the pinned format, not a raw timestamp', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(page([ROW]))));
    wrap();
    expect(await screen.findByText('04/11/2026 08:05')).toBeInTheDocument();
  });

  it('narrows by action and starts the cursor stack again', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(page([ROW])));
    vi.stubGlobal('fetch', fetchMock);
    wrap();
    await screen.findByText('user_created');
    await userEvent.type(screen.getByLabelText(/action/i), 'login_failed');
    await userEvent.click(screen.getByRole('button', { name: /filter/i }));
    const paths = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(paths).toContain('/api/v1/audit-logs?action=login_failed');
  });

  it('says the log is empty rather than showing a bare table', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(page([]))));
    wrap();
    expect(await screen.findByText(/no audit entries/i)).toBeInTheDocument();
  });

  it('reports a failure without the backend title, and not as an empty log', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ title: 'Forbidden', status: 403 }), {
          status: 403,
          headers: { 'content-type': 'application/problem+json' },
        }),
      ),
    );
    wrap();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(/no audit entries/i)).toBeNull();
    expect(screen.queryByText('Forbidden')).toBeNull();
  });
  it('moves the cursor with Next and Previous', async () => {
    const fetchMock = vi.fn((path: string) => {
      if (path.includes('cursor=c2')) {
        return Promise.resolve(Response.json(page([{ ...ROW, id: 'a3', action: 'page_two' }])));
      }
      return Promise.resolve(Response.json({ ...page([ROW]), next_cursor: 'c2', total: 2 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    wrap();
    await screen.findByText('user_created');
    expect(screen.getByRole('button', { name: /^previous/i })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: /^next/i }));
    await screen.findByText('page_two');
    expect(screen.queryByText('user_created')).toBeNull();
    expect(paths(fetchMock).at(-1)).toBe('/api/v1/audit-logs?cursor=c2');
    expect(screen.getByRole('button', { name: /^next/i })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: /^previous/i }));
    await screen.findByText('user_created');
    expect(screen.queryByText('page_two')).toBeNull();
  });

  it('goes back to the first page when a filter is applied', async () => {
    const fetchMock = vi.fn((path: string) =>
      Promise.resolve(
        Response.json(
          path.includes('cursor=')
            ? page([{ ...ROW, id: 'a3', action: 'page_two' }])
            : { ...page([ROW]), next_cursor: 'c2', total: 2 },
        ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    wrap();
    await screen.findByText('user_created');
    await userEvent.click(screen.getByRole('button', { name: /^next/i }));
    await screen.findByText('page_two');
    await userEvent.type(screen.getByLabelText(/action/i), 'x');
    await userEvent.click(screen.getByRole('button', { name: /^filter$/i }));
    await screen.findByText('user_created');
    expect(paths(fetchMock).at(-1)).toBe('/api/v1/audit-logs?action=x');
  });

  it('sends the date range as Vietnam-day instants', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(page([ROW])));
    vi.stubGlobal('fetch', fetchMock);
    wrap();
    await screen.findByText('user_created');
    await userEvent.type(screen.getByLabelText('From'), '2026-11-04');
    await userEvent.type(screen.getByLabelText('To'), '2026-11-05');
    await userEvent.click(screen.getByRole('button', { name: /^filter$/i }));
    await vi.waitFor(() => {
      const last = new URL(paths(fetchMock).at(-1) ?? '', 'http://x').searchParams;
      expect(last.get('created_at_from')).toBe('2026-11-03T17:00:00.000Z');
      expect(last.get('created_at_to')).toBe('2026-11-05T16:59:59.999Z');
    });
  });

  it('refuses a range that ends before it starts and sends nothing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(page([ROW])));
    vi.stubGlobal('fetch', fetchMock);
    wrap();
    await screen.findByText('user_created');
    const before = fetchMock.mock.calls.length;
    await userEvent.type(screen.getByLabelText('From'), '2026-11-05');
    await userEvent.type(screen.getByLabelText('To'), '2026-11-04');
    await userEvent.click(screen.getByRole('button', { name: /^filter$/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/after the end date/i);
    expect(fetchMock.mock.calls.length).toBe(before);
  });

  it('is usable by an Admin: rows show and no Superadmin-only endpoint is called', async () => {
    const fetchMock = vi.fn((path: string) => {
      if (path === '/api/v1/auth/me') {
        return Promise.resolve(
          Response.json({ id: '9', username: 'ops', display_name: 'Ops', role: 'admin' }),
        );
      }
      if (path.startsWith('/api/v1/audit-logs')) {
        return Promise.resolve(Response.json(page([ROW])));
      }
      // Anything else is an S12 endpoint, which answers an Admin with 403.
      return Promise.resolve(
        new Response(JSON.stringify({ title: 'Forbidden', status: 403 }), {
          status: 403,
          headers: { 'content-type': 'application/problem+json' },
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    wrap();
    expect(await screen.findByText('user_created')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(paths(fetchMock).filter((p) => !p.startsWith('/api/v1/audit-logs'))).toEqual([]);
  });
});
