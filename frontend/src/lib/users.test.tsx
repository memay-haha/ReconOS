import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useActiveSessionCount } from './sessions';
import { useUsers } from './users';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => vi.unstubAllGlobals());

const PAGE = {
  items: [
    {
      id: '1',
      username: 'rootadmin',
      display_name: 'Quản trị gốc',
      role: 'superadmin',
      is_locked: false,
      created_at: '2026-11-04T08:00:00Z',
      last_login_at: null,
    },
  ],
  next_cursor: 'c1',
  total: 1,
  total_is_estimate: false,
};

describe('useUsers', () => {
  it('reads the first page without a cursor', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(PAGE));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useUsers(null), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/users');
    expect(result.current.data?.items[0]?.username).toBe('rootadmin');
  });

  it('passes the cursor on for a later page', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(PAGE));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useUsers('c1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/users?cursor=c1');
  });

  it('surfaces a rejected request as an error state', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ code: 'forbidden' }), { status: 403 })),
    );
    const { result } = renderHook(() => useUsers(null), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useActiveSessionCount', () => {
  it('keeps only the total of the session page', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ items: [], next_cursor: null, total: 7, total_is_estimate: false }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useActiveSessionCount(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/user-sessions');
    expect(result.current.data).toBe(7);
  });

  it('is an error state for a caller who may not list sessions', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ code: 'forbidden' }), { status: 403 })),
    );
    const { result } = renderHook(() => useActiveSessionCount(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
