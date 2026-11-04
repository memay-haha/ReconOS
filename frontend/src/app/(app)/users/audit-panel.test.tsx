import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuditPanel } from './audit-panel';

function entry(id: string, action: string) {
  return {
    id,
    user_id: '1',
    action,
    resource_type: 'user',
    resource_id: '2',
    detail: { username: 'analyst' },
    ip_address: '203.0.113.9',
    created_at: '2026-11-04T09:00:00Z',
  };
}

function page(items: unknown[], next: string | null = null) {
  return { items, next_cursor: next, total: items.length, total_is_estimate: false };
}

const PAGE = page([entry('a1', 'user_created')]);

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

function paths(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map((call) => call[0] as string);
}

afterEach(() => vi.unstubAllGlobals());

describe('AuditPanel', () => {
  it('reads the whole log when no account is picked', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(PAGE));
    vi.stubGlobal('fetch', fetchMock);
    wrap(<AuditPanel userId={null} />);
    await screen.findByText('user_created');
    expect(paths(fetchMock)[0]).toBe('/api/v1/audit-logs');
  });

  it('renders the time as dd/mm/yyyy HH:mm in Vietnam time', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(PAGE)));
    wrap(<AuditPanel userId={null} />);
    expect(await screen.findByText('04/11/2026 16:00')).toBeInTheDocument();
  });

  it('narrows the log to the account that is picked', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(PAGE));
    vi.stubGlobal('fetch', fetchMock);
    wrap(<AuditPanel userId="1" />);
    await screen.findByText('user_created');
    expect(paths(fetchMock)[0]).toBe('/api/v1/audit-logs?user_id=1');
  });

  it('narrows the log by action', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(PAGE));
    vi.stubGlobal('fetch', fetchMock);
    wrap(<AuditPanel userId={null} />);
    await screen.findByText('user_created');
    await userEvent.type(screen.getByLabelText(/^thao tác$/i), 'login_failed');
    await userEvent.click(screen.getByRole('button', { name: /lọc/i }));
    await vi.waitFor(() =>
      expect(paths(fetchMock)).toContain('/api/v1/audit-logs?action=login_failed'),
    );
  });

  it('drops the action filter from the URL when the field is cleared', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(PAGE));
    vi.stubGlobal('fetch', fetchMock);
    wrap(<AuditPanel userId={null} />);
    await screen.findByText('user_created');
    const field = screen.getByLabelText(/^thao tác$/i);
    await userEvent.type(field, 'login_failed');
    await userEvent.click(screen.getByRole('button', { name: /lọc/i }));
    await userEvent.clear(field);
    await userEvent.click(screen.getByRole('button', { name: /lọc/i }));
    await vi.waitFor(() => expect(paths(fetchMock).at(-1)).toBe('/api/v1/audit-logs'));
    expect(paths(fetchMock).some((p) => p.includes('action=&'))).toBe(false);
  });

  it('says so when nothing matches the filter', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(page([]))));
    wrap(<AuditPanel userId={null} />);
    expect(await screen.findByText(/không có dòng nhật ký nào/i)).toBeInTheDocument();
  });

  it('shows loading, failure and empty as three different things', async () => {
    let release: (r: Response) => void = () => undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(new Promise<Response>((resolve) => (release = resolve))),
    );
    const view = wrap(<AuditPanel userId={null} />);
    expect(screen.getByText(/đang tải nhật ký/i)).toBeInTheDocument();
    expect(screen.queryByText(/không có dòng nhật ký nào/i)).not.toBeInTheDocument();
    release(Response.json({ title: 'Boom' }, { status: 500 }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Không tải được nhật ký thao tác.');
    expect(screen.queryByText(/không có dòng nhật ký nào/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Boom')).not.toBeInTheDocument();
    expect(screen.queryByText(/đang tải nhật ký/i)).not.toBeInTheDocument();
    view.unmount();
  });

  it('resets the cursors when the filter changes, not on a plain page move', async () => {
    const fetchMock = vi.fn((path: string) => {
      if (path === '/api/v1/audit-logs')
        return Promise.resolve(Response.json(page([entry('a1', 'user_created')], 'c1')));
      if (path === '/api/v1/audit-logs?cursor=c1')
        return Promise.resolve(Response.json(page([entry('a2', 'user_locked')], null)));
      return Promise.resolve(Response.json(page([entry('a3', 'login_failed')], null)));
    });
    vi.stubGlobal('fetch', fetchMock);
    wrap(<AuditPanel userId={null} />);
    await screen.findByText('user_created');
    await userEvent.click(screen.getByRole('button', { name: /^Sau/ }));
    await screen.findByText('user_locked');
    expect(screen.getByRole('button', { name: /^Trước/ })).toBeEnabled();
    await userEvent.type(screen.getByLabelText(/^thao tác$/i), 'login_failed');
    await userEvent.click(screen.getByRole('button', { name: /lọc/i }));
    await screen.findByText('login_failed', { selector: 'span' });
    expect(screen.getByRole('button', { name: /^Trước/ })).toBeDisabled();
    expect(paths(fetchMock as unknown as ReturnType<typeof vi.fn>)).toContain(
      '/api/v1/audit-logs?action=login_failed',
    );
  });

  it('goes back to the first page when the picked account changes', async () => {
    const fetchMock = vi.fn((path: string) => {
      if (path === '/api/v1/audit-logs')
        return Promise.resolve(Response.json(page([entry('a1', 'user_created')], 'c1')));
      if (path === '/api/v1/audit-logs?cursor=c1')
        return Promise.resolve(Response.json(page([entry('a2', 'user_locked')], null)));
      return Promise.resolve(Response.json(page([entry('a4', 'login_ok')], null)));
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const tree = (id: string | null) => (
      <QueryClientProvider client={client}>
        <AuditPanel userId={id} />
      </QueryClientProvider>
    );
    const view = render(tree(null));
    await screen.findByText('user_created');
    await userEvent.click(screen.getByRole('button', { name: /^Sau/ }));
    await screen.findByText('user_locked');
    view.rerender(tree('1'));
    await screen.findByText('login_ok');
    expect(screen.getByRole('button', { name: /^Trước/ })).toBeDisabled();
  });
});
