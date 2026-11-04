import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useActiveSessionCount } from './sessions';
import { sessionKeys } from './sessions';
import {
  type UserPage,
  useLockUser,
  useUnlockUser,
  useUpdateUser,
  useUsers,
  userKeys,
} from './users';

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
      display_name: 'Root Admin',
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

describe('lock and unlock invalidation', () => {
  function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spy = vi.spyOn(client, 'invalidateQueries');
    const wrap = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return { spy, wrap };
  }
  const keysOf = (spy: { mock: { calls: readonly (readonly unknown[])[] } }) =>
    spy.mock.calls.map(([filter]) => (filter as { queryKey: unknown }).queryKey);

  it('locking refreshes the account list and the session counts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const { spy, wrap } = setup();
    const { result } = renderHook(() => useLockUser(), { wrapper: wrap });
    result.current.mutate('2');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const keys = keysOf(spy);
    expect(keys).toContainEqual(userKeys.all);
    // The sessions prefix covers sessionKeys.active and every per-account list.
    expect(keys).toContainEqual(sessionKeys.all);
    expect(sessionKeys.active.slice(0, sessionKeys.all.length)).toEqual([...sessionKeys.all]);
  });

  it('unlocking refreshes only the account list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const { spy, wrap } = setup();
    const { result } = renderHook(() => useUnlockUser(), { wrapper: wrap });
    result.current.mutate('2');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(keysOf(spy)).toEqual([userKeys.all]);
  });
});

describe('a write response never reaches the row cache', () => {
  it('keeps the cached active_user_session_count while the refetch is still pending', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const withCount = { ...PAGE.items[0]!, active_user_session_count: 4 };
    let listReads = 0;
    const fetchMock = vi.fn((...[, init]: [string, RequestInit?]) => {
      if (init?.method === 'PATCH') {
        // POST and PATCH answer without the computed count.
        return Promise.resolve(Response.json({ ...PAGE.items[0]!, display_name: 'Renamed' }));
      }
      listReads += 1;
      // The refetch after the write never settles, so only an optimistic write could change the cache.
      if (listReads > 1) return new Promise<Response>(() => undefined);
      return Promise.resolve(Response.json({ ...PAGE, items: [withCount] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const useBoth = () => ({ list: useUsers(null), update: useUpdateUser('1') });
    const { result } = renderHook(useBoth, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    result.current.update.mutate({ display_name: 'Renamed' });
    await waitFor(() => expect(listReads).toBe(2));

    const cached = client.getQueryData<UserPage>(userKeys.page(null));
    expect(cached?.items[0]?.active_user_session_count).toBe(4);
    expect(cached?.items[0]?.display_name).toBe(PAGE.items[0]?.display_name);
  });
});
