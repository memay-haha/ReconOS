import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { UserRow } from '@/lib/users';

import { UserActions } from './user-actions';

const OPEN: UserRow = {
  active_user_session_count: 0,
  id: '2',
  username: 'analyst',
  display_name: 'Analyst',
  role: 'user',
  is_locked: false,
  created_at: '2026-11-04T08:00:00Z',
  last_login_at: null,
};
const LOCKED: UserRow = { ...OPEN, is_locked: true };

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

afterEach(() => vi.unstubAllGlobals());

describe('UserActions', () => {
  it('offers Lock for an open account', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    wrap(<UserActions user={OPEN} isSelf={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Lock analyst' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/users/2/lock');
  });

  it('offers Unlock for a locked account', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    wrap(<UserActions user={LOCKED} isSelf={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Unlock analyst' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/users/2/unlock');
  });

  it('hides Lock on the signed in account, which the backend refuses anyway', () => {
    wrap(<UserActions user={OPEN} isSelf />);
    expect(screen.queryByRole('button', { name: 'Lock analyst' })).not.toBeInTheDocument();
  });

  it('reports a refusal from the backend in English, not its English title', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ title: 'Cannot lock yourself', status: 409 }), {
          status: 409,
          headers: { 'content-type': 'application/problem+json' },
        }),
      ),
    );
    wrap(<UserActions user={OPEN} isSelf={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Lock analyst' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The server refused this action.');
    expect(alert).not.toHaveTextContent('Cannot lock yourself');
  });

  it('says it could not reach the server on other failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed')));
    wrap(<UserActions user={OPEN} isSelf={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Lock analyst' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not change the account.');
  });
});
