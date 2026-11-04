import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useLogin, useMe } from './auth';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => vi.unstubAllGlobals());

const ME = { id: '1', username: 'rootadmin', display_name: 'Root', role: 'superadmin' };

describe('useMe', () => {
  it('reads the signed in account', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(ME)));
    const { result } = renderHook(() => useMe(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.username).toBe('rootadmin');
  });

  it('does not retry a 401, because no session is a normal state', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ code: 'unauthenticated' }), { status: 401 }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useMe(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('useLogin', () => {
  it('posts the credentials and leaves no password in the mutation cache', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const own = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result, unmount } = renderHook(() => useLogin(), { wrapper: own });
    result.current.mutate({ username: 'rootadmin', password: 'secret value here' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/api/v1/auth/login');
    expect(init.method).toBe('POST');
    // The mounted hook still observes the mutation; once it unmounts, gcTime 0 evicts it.
    unmount();
    await waitFor(() => expect(client.getMutationCache().getAll()).toHaveLength(0));
    expect(JSON.stringify(client.getMutationCache().getAll())).not.toContain('secret value here');
  });
});
