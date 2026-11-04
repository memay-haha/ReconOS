import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
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

function list(items: unknown[], next: string | null, total = 2) {
  return { items, next_cursor: next, total, total_is_estimate: false };
}

afterEach(() => vi.unstubAllGlobals());

describe('UsersPage selection while paging', () => {
  it('drops a selection that left the page, so no PATCH and no hidden audit filter survive', async () => {
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

    const auditCalls = () =>
      fetchMock.mock.calls
        .map(([path]) => path)
        .filter((path) => path.startsWith('/api/v1/audit-logs'));

    await userEvent.click(await screen.findByRole('button', { name: 'analyst' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeInTheDocument();
    await vi.waitFor(() => expect(auditCalls().at(-1)).toBe('/api/v1/audit-logs?user_id=2'));

    const pager = screen.getByRole('navigation', { name: 'Phân trang danh sách tài khoản' });
    await userEvent.click(within(pager).getByRole('button', { name: /^Sau/ }));
    await screen.findByRole('button', { name: 'other' });

    expect(screen.queryByRole('button', { name: 'Lưu' })).not.toBeInTheDocument();
    const patches = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH');
    expect(patches).toHaveLength(0);

    // Nothing on screen names the account any more, so the log must be the whole log.
    expect(screen.queryByRole('region', { name: 'Chi tiết tài khoản' })).not.toBeInTheDocument();
    await vi.waitFor(() => expect(auditCalls().at(-1)).toBe('/api/v1/audit-logs'));
  });
});

const EMPTY = { items: [], next_cursor: null, total: 0, total_is_estimate: false };
const ME = { id: '1', username: 'rootadmin', display_name: 'Gốc', role: 'superadmin' };

type Handler = (path: string) => Response | Promise<Response>;

function renderPage(handler: Handler) {
  vi.stubGlobal(
    'fetch',
    vi.fn((...[path]: [string, RequestInit?]) => Promise.resolve(handler(path))),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <UsersPage />
    </QueryClientProvider>,
  );
}

function ok(path: string): Response | null {
  if (path === '/api/v1/auth/me') return Response.json(ME);
  if (path.startsWith('/api/v1/audit-logs')) {
    return Response.json({
      items: [
        {
          id: 'a1',
          user_id: '1',
          action: 'user_created',
          resource_type: 'user',
          resource_id: '2',
          detail: null,
          ip_address: '203.0.113.9',
          created_at: '2026-11-04T09:00:00Z',
        },
      ],
      next_cursor: null,
      total: 1,
      total_is_estimate: false,
    });
  }
  return null;
}

describe('UsersPage list states', () => {
  it('shows loading while the users request is pending', () => {
    renderPage((path) => {
      if (path === '/api/v1/users') return new Promise<Response>(() => undefined) as never;
      return ok(path) ?? Response.json(EMPTY);
    });
    expect(screen.getByText('Đang tải danh sách tài khoản…')).toBeInTheDocument();
    expect(screen.queryByText(/chưa có tài khoản/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Không tải được danh sách tài khoản.')).not.toBeInTheDocument();
  });

  it('shows the empty list as its own sentence, not as an error or loading', async () => {
    renderPage((path) =>
      path === '/api/v1/users' ? Response.json(EMPTY) : (ok(path) ?? Response.json(EMPTY)),
    );
    expect(await screen.findByText('Chưa có tài khoản nào.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('Đang tải danh sách tài khoản…')).not.toBeInTheDocument();
    expect(screen.queryByText('Không tải được danh sách tài khoản.')).not.toBeInTheDocument();
  });

  it('never renders a failed users request as an empty list', async () => {
    renderPage((path) =>
      path === '/api/v1/users'
        ? Response.json({ title: 'Boom' }, { status: 500 })
        : (ok(path) ?? Response.json(EMPTY)),
    );
    expect(await screen.findByText('Không tải được danh sách tài khoản.')).toBeInTheDocument();
    expect(screen.queryByText('Chưa có tài khoản nào.')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('Đang tải danh sách tài khoản…')).not.toBeInTheDocument();
    expect(screen.queryByText('Boom')).not.toBeInTheDocument();
  });
});

describe('UsersPage session card', () => {
  it('keeps the table and marks the session card unavailable on a 403', async () => {
    renderPage((path) => {
      if (path === '/api/v1/users') return Response.json(list([row('2', 'analyst')], null, 37));
      if (path === '/api/v1/user-sessions')
        return Response.json({ title: 'Forbidden' }, { status: 403 });
      return ok(path) ?? Response.json(EMPTY);
    });
    expect(await screen.findByRole('button', { name: 'analyst' })).toBeInTheDocument();
    const card = (await screen.findByText('Phiên đang hoạt động')).parentElement as HTMLElement;
    expect(within(card).getByText('Không khả dụng')).toBeInTheDocument();
    const users = screen.getByText('Tổng tài khoản').parentElement as HTMLElement;
    expect(within(users).getByText('37')).toBeInTheDocument();
  });
});

describe('UsersPage audit panel', () => {
  it('renders the audit log alongside the rest, and narrows it to the picked account', async () => {
    const fetchSpy = vi.fn();
    renderPage((path) => {
      fetchSpy(path);
      if (path === '/api/v1/users') return Response.json(list([row('2', 'analyst')], null));
      return ok(path) ?? Response.json(EMPTY);
    });
    expect(await screen.findByRole('heading', { name: 'Nhật ký thao tác' })).toBeInTheDocument();
    expect(await screen.findByText('user_created')).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledWith('/api/v1/audit-logs');
    await userEvent.click(await screen.findByRole('button', { name: 'analyst' }));
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledWith('/api/v1/audit-logs?user_id=2'));
  });
});
