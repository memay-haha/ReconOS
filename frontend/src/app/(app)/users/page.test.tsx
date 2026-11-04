import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import UsersPage from './page';

function row(id: string, username: string) {
  return {
    id,
    username,
    display_name: `Tên ${username}`,
    role: 'user',
    is_locked: false,
    created_at: '2026-11-04T08:00:00Z',
    last_login_at: null,
  };
}

function list(items: unknown[], next: string | null) {
  return { items, next_cursor: next, total: 2, total_is_estimate: false };
}

afterEach(() => vi.unstubAllGlobals());

describe('UsersPage edit form', () => {
  it('closes the edit form when the reader pages away, so no PATCH can target an empty id', async () => {
    const fetchMock = vi.fn((...[path]: [string, RequestInit?]) => {
      if (path === '/api/v1/users')
        return Promise.resolve(Response.json(list([row('2', 'analyst')], 'c1')));
      if (path.startsWith('/api/v1/users?cursor=')) {
        return Promise.resolve(Response.json(list([row('3', 'other')], null)));
      }
      if (path === '/api/v1/user-sessions') {
        return Promise.resolve(
          Response.json({ items: [], next_cursor: null, total: 0, total_is_estimate: false }),
        );
      }
      if (path === '/api/v1/auth/me') {
        return Promise.resolve(
          Response.json({
            id: '1',
            username: 'rootadmin',
            display_name: 'Gốc',
            role: 'superadmin',
          }),
        );
      }
      return Promise.resolve(
        Response.json({ items: [], next_cursor: null, total: 0, total_is_estimate: false }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <UsersPage />
      </QueryClientProvider>,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'analyst' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Sau' }));
    await screen.findByRole('button', { name: 'other' });

    expect(screen.queryByRole('button', { name: 'Lưu' })).not.toBeInTheDocument();
    const patches = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH');
    expect(patches).toHaveLength(0);
  });
});
