import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DispatcherPill } from './login-status';

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DispatcherPill />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('S01 dispatcher pill (decision D6-B)', () => {
  it('reads online while GET /health answers 204', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    wrap();
    expect(await screen.findByText('Dispatcher online')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/v1/health', expect.anything());
  });

  it('reads offline when Backend API does not answer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    wrap();
    expect(await screen.findByText('Dispatcher offline')).toBeInTheDocument();
  });
});
