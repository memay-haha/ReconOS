import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useUserSessions } from '@/lib/sessions';

import { SessionPanel } from './session-panel';

const ROW = {
  id: 's1',
  user_id: '2',
  ip_address: '203.0.113.9',
  user_agent: 'Mozilla/5.0',
  created_at: '2026-11-04T08:00:00Z',
  last_seen_at: '2026-11-04T09:00:00Z',
  expires_at: '2026-11-04T20:00:00Z',
};

function page(items: unknown[]) {
  return { items, next_cursor: null, total: items.length, total_is_estimate: false };
}

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  return {
    invalidate,
    ...render(<QueryClientProvider client={client}>{node}</QueryClientProvider>),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('SessionPanel', () => {
  it('lists the address and the last time seen as dd/mm/yyyy HH:mm in Vietnam time', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(page([ROW]))));
    wrap(<SessionPanel userId="2" />);
    expect(await screen.findByText('203.0.113.9')).toBeInTheDocument();
    expect(screen.getByText(/04\/11\/2026 16:00/)).toBeInTheDocument();
  });

  it('shows a Vietnamese phrase for a null address', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json(page([{ ...ROW, ip_address: null }]))),
    );
    wrap(<SessionPanel userId="2" />);
    expect(await screen.findByText('Không rõ địa chỉ')).toBeInTheDocument();
  });

  it('revokes the session the reader picked and the revoked row disappears', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(page([ROW])))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json(page([])));
    vi.stubGlobal('fetch', fetchMock);
    const { invalidate } = wrap(<SessionPanel userId="2" />);
    await userEvent.click(await screen.findByRole('button', { name: /thu hồi/i }));
    const [path, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(path).toBe('/api/v1/user-sessions/s1');
    expect(init.method).toBe('DELETE');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['sessions'] });
    expect(await screen.findByText(/không có phiên nào đang hoạt động/i)).toBeInTheDocument();
    expect(screen.queryByText('203.0.113.9')).not.toBeInTheDocument();
  });

  it('says the reader lacks permission on 403 and keeps the English title out', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(page([ROW])))
      .mockResolvedValueOnce(Response.json({ title: 'Forbidden', status: 403 }, { status: 403 }))
      .mockResolvedValue(Response.json(page([ROW])));
    vi.stubGlobal('fetch', fetchMock);
    wrap(<SessionPanel userId="2" />);
    await userEvent.click(await screen.findByRole('button', { name: /thu hồi/i }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Chỉ Superadmin được thu hồi phiên đăng nhập.');
    expect(alert).not.toHaveTextContent('Forbidden');
  });

  it('says the session is gone on 404 and removes the dead row', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(page([ROW])))
      .mockResolvedValueOnce(Response.json({ title: 'Not Found', status: 404 }, { status: 404 }))
      .mockResolvedValue(Response.json(page([])));
    vi.stubGlobal('fetch', fetchMock);
    wrap(<SessionPanel userId="2" />);
    await userEvent.click(await screen.findByRole('button', { name: /thu hồi/i }));
    expect(await screen.findByText(/không có phiên nào đang hoạt động/i)).toBeInTheDocument();
    expect(screen.queryByText('203.0.113.9')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Phiên này đã hết hạn hoặc đã bị thu hồi.');
  });

  it('asks the reader to retry on a network failure', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(page([ROW])))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(Response.json(page([ROW])));
    vi.stubGlobal('fetch', fetchMock);
    wrap(<SessionPanel userId="2" />);
    await userEvent.click(await screen.findByRole('button', { name: /thu hồi/i }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Không thu hồi được phiên. Thử lại sau.');
    expect(alert).not.toHaveTextContent('Failed to fetch');
  });

  it('keeps the good list when a background refetch fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(page([ROW])))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValue(Response.json({ title: 'Boom', status: 500 }, { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    wrap(<SessionPanel userId="2" />);
    await userEvent.click(await screen.findByRole('button', { name: /thu hồi/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/không làm mới được/i);
    expect(screen.getByText('203.0.113.9')).toBeInTheDocument();
  });

  it('says so when the account has no live session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(page([]))));
    wrap(<SessionPanel userId="2" />);
    expect(await screen.findByText(/không có phiên nào đang hoạt động/i)).toBeInTheDocument();
  });

  it('shows a loading state before the answer arrives', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => undefined)));
    wrap(<SessionPanel userId="2" />);
    expect(screen.getByText(/đang tải phiên đăng nhập/i)).toBeInTheDocument();
  });

  it('shows an error, not the empty message, when the request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ title: 'Boom', status: 500 }, { status: 500 })),
    );
    wrap(<SessionPanel userId="2" />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/không tải được phiên đăng nhập/i);
    expect(screen.queryByText(/không có phiên nào/i)).not.toBeInTheDocument();
  });
});

describe('useUserSessions', () => {
  it('sends no request while no account is selected', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const client = new QueryClient();
    renderHook(() => useUserSessions(null), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
