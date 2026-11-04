import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import UsersPage from './page';

function row(id: string, username: string, sessions = 0) {
  return {
    id,
    username,
    display_name: `Name ${username}`,
    role: 'user',
    is_locked: false,
    created_at: '2026-11-04T08:00:00Z',
    last_login_at: null,
    active_user_session_count: sessions,
  };
}

function list(items: unknown[], next: string | null, total = 2) {
  return { items, next_cursor: next, total, total_is_estimate: false };
}

const EMPTY = { items: [], next_cursor: null, total: 0, total_is_estimate: false };
const ME = { id: '1', username: 'rootadmin', display_name: 'Root', role: 'superadmin' };

type Handler = (path: string) => Response | Promise<Response>;

function renderPage(handler: Handler) {
  const fetchMock = vi.fn((...[path]: [string, RequestInit?]) => Promise.resolve(handler(path)));
  vi.stubGlobal('fetch', fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <UsersPage />
    </QueryClientProvider>,
  );
  return fetchMock;
}

function ok(path: string): Response | null {
  if (path === '/api/v1/auth/me') return Response.json(ME);
  if (path === '/api/v1/user-sessions') return Response.json(EMPTY);
  return null;
}

afterEach(() => vi.unstubAllGlobals());

describe('UsersPage selection while paging', () => {
  it('drops a selection that left the page, so no edit form and no PATCH survive', async () => {
    const fetchMock = renderPage((path) => {
      if (path === '/api/v1/users') return Response.json(list([row('2', 'analyst')], 'c1'));
      if (path.startsWith('/api/v1/users?cursor=')) {
        return Response.json(list([row('3', 'other')], null));
      }
      return ok(path) ?? Response.json(EMPTY);
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Edit analyst' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Account details' })).toBeInTheDocument();

    const pager = screen.getByRole('navigation', { name: 'Account list pagination' });
    await userEvent.click(within(pager).getByRole('button', { name: /^Next/ }));
    await screen.findByRole('button', { name: 'Edit other' });

    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Account details' })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(0);
  });

  it('walks back with Previous to the first page', async () => {
    renderPage((path) => {
      if (path === '/api/v1/users') return Response.json(list([row('2', 'analyst')], 'c1'));
      if (path.startsWith('/api/v1/users?cursor=')) {
        return Response.json(list([row('3', 'other')], null));
      }
      return ok(path) ?? Response.json(EMPTY);
    });
    const pager = await screen.findByRole('navigation', { name: 'Account list pagination' });
    expect(within(pager).getByRole('button', { name: /^Previous/ })).toBeDisabled();
    await userEvent.click(within(pager).getByRole('button', { name: /^Next/ }));
    await screen.findByRole('button', { name: 'Edit other' });
    // The pager is remounted while the next page loads: query it again.
    const second = screen.getByRole('navigation', { name: 'Account list pagination' });
    await userEvent.click(within(second).getByRole('button', { name: /^Previous/ }));
    expect(await screen.findByRole('button', { name: 'Edit analyst' })).toBeInTheDocument();
  });
});

describe('UsersPage edit form', () => {
  it('renders no edit form until an account is chosen', async () => {
    renderPage((path) =>
      path === '/api/v1/users'
        ? Response.json(list([row('2', 'analyst')], null))
        : (ok(path) ?? Response.json(EMPTY)),
    );
    await screen.findByRole('button', { name: 'Edit analyst' });
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });

  it('keeps the form open when Edit is pressed, and shows the sessions of that account', async () => {
    renderPage((path) => {
      if (path === '/api/v1/users') return Response.json(list([row('2', 'analyst')], null));
      if (path === '/api/v1/users/2/sessions') return Response.json(EMPTY);
      return ok(path) ?? Response.json(EMPTY);
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Edit analyst' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(await screen.findByText('No active sessions.')).toBeInTheDocument();
  });
});

describe('UsersPage list states', () => {
  it('shows loading while the users request is pending', () => {
    renderPage((path) => {
      if (path === '/api/v1/users') return new Promise<Response>(() => undefined) as never;
      return ok(path) ?? Response.json(EMPTY);
    });
    expect(screen.getByText('Loading the account list…')).toBeInTheDocument();
    expect(screen.queryByText(/no accounts yet/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Could not load the account list.')).not.toBeInTheDocument();
  });

  it('shows the empty list as its own sentence, not as an error or loading', async () => {
    renderPage((path) =>
      path === '/api/v1/users' ? Response.json(EMPTY) : (ok(path) ?? Response.json(EMPTY)),
    );
    expect(await screen.findByText('No accounts yet.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('Loading the account list…')).not.toBeInTheDocument();
    expect(screen.queryByText('Could not load the account list.')).not.toBeInTheDocument();
  });

  it('never renders a failed users request as an empty list', async () => {
    renderPage((path) =>
      path === '/api/v1/users'
        ? Response.json({ title: 'Boom' }, { status: 500 })
        : (ok(path) ?? Response.json(EMPTY)),
    );
    expect(await screen.findByText('Could not load the account list.')).toBeInTheDocument();
    expect(screen.queryByText('No accounts yet.')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('Loading the account list…')).not.toBeInTheDocument();
    expect(screen.queryByText('Boom')).not.toBeInTheDocument();
  });
});

describe('UsersPage stat tiles', () => {
  function tile(label: string): HTMLElement {
    return screen.getByText(label).closest('[data-stat-tile]') as HTMLElement;
  }

  it('keeps the table and marks the session tile unavailable on a 403', async () => {
    renderPage((path) => {
      if (path === '/api/v1/users') return Response.json(list([row('2', 'analyst')], null, 37));
      if (path === '/api/v1/user-sessions')
        return Response.json({ title: 'Forbidden' }, { status: 403 });
      return ok(path) ?? Response.json(EMPTY);
    });
    expect(await screen.findByRole('table')).toBeInTheDocument();
    await vi.waitFor(() =>
      expect(within(tile('Active sessions')).getByText('Unavailable')).toBeInTheDocument(),
    );
    expect(within(tile('Total accounts')).getByText('37')).toBeInTheDocument();
  });

  it('counts roles from the rows on screen and names the glossary roles', async () => {
    renderPage((path) =>
      path === '/api/v1/users'
        ? Response.json(
            list(
              [{ ...row('1', 'rootadmin'), role: 'superadmin' }, row('2', 'a'), row('3', 'b')],
              null,
              3,
            ),
          )
        : (ok(path) ?? Response.json(EMPTY)),
    );
    expect(await screen.findByText('1 Superadmin · 2 User')).toBeInTheDocument();
  });
});

describe('UsersPage mutations', () => {
  it('refetches the list after a lock, so the row keeps its session count', async () => {
    let users = 0;
    const fetchMock = renderPage((path) => {
      if (path === '/api/v1/users') {
        users += 1;
        return Response.json(list([row('2', 'analyst', users === 1 ? 3 : 0)], null));
      }
      if (path === '/api/v1/users/2/lock') return new Response(null, { status: 204 });
      return ok(path) ?? Response.json(EMPTY);
    });
    expect(await screen.findByText('3 sessions')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Lock analyst' }));
    expect(await screen.findByText('No active sessions')).toBeInTheDocument();
    const paths = fetchMock.mock.calls.map(([path]) => path);
    expect(paths.filter((p) => p === '/api/v1/users')).toHaveLength(2);
    // The lock cancels sessions, so the session figure is read again too.
    expect(paths.filter((p) => p === '/api/v1/user-sessions').length).toBeGreaterThanOrEqual(2);
  });
});
