import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { UserRow } from '@/lib/users';

import { StatCards } from './stat-cards';
import { UserTable } from './user-table';

const ROWS: UserRow[] = [
  {
    id: '1',
    username: 'rootadmin',
    display_name: 'Root Admin',
    role: 'superadmin',
    is_locked: false,
    created_at: '2026-11-04T08:00:00Z',
    last_login_at: '2026-11-04T09:30:00Z',
    active_user_session_count: 2,
  },
  {
    id: '2',
    username: 'analyst',
    display_name: 'Analyst',
    role: 'user',
    is_locked: true,
    created_at: '2026-11-04T08:00:00Z',
    last_login_at: null,
    active_user_session_count: 0,
  },
];

function table(
  props: Partial<{
    users: UserRow[];
    selectedId: string | null;
    meId: string | null;
    onSelect: (id: string) => void;
    onEdit: (id: string) => void;
  }> = {},
): ReactElement {
  const client = new QueryClient();
  return (
    <QueryClientProvider client={client}>
      <UserTable
        users={props.users ?? ROWS}
        selectedId={props.selectedId ?? null}
        meId={props.meId ?? null}
        onSelect={props.onSelect ?? vi.fn()}
        onEdit={props.onEdit ?? vi.fn()}
      />
    </QueryClientProvider>
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('UserTable', () => {
  it('writes each role with its glossary name', () => {
    render(table());
    expect(screen.getByText('Superadmin')).toBeInTheDocument();
    expect(screen.getByText('User')).toBeInTheDocument();
  });

  it('marks a locked account in words, not only by colour', () => {
    render(table());
    const locked = screen.getByRole('row', { name: /analyst/ });
    expect(within(locked).getByText('Locked')).toBeInTheDocument();
    const open = screen.getByRole('row', { name: /rootadmin/ });
    expect(within(open).queryByText('Locked')).not.toBeInTheDocument();
  });

  it('says so when an account has never signed in', () => {
    render(table());
    expect(screen.getByText('Never signed in')).toBeInTheDocument();
  });

  it('renders the last sign-in as dd/mm/yyyy HH:mm', () => {
    render(table({ users: [{ ...ROWS[0]!, last_login_at: '2026-11-04T08:30:00Z' }] }));
    expect(screen.getByText('04/11/2026 15:30')).toBeInTheDocument();
  });

  it('shows the active session count of each account, and says so at zero', () => {
    render(table());
    expect(
      within(screen.getByRole('row', { name: /rootadmin/ })).getByText('2 sessions'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('row', { name: /analyst/ })).getByText('No active sessions'),
    ).toBeInTheDocument();
  });

  it('uses the singular for one session', () => {
    render(table({ users: [{ ...ROWS[0]!, active_user_session_count: 1 }] }));
    expect(screen.getByText('1 session')).toBeInTheDocument();
  });

  it('reports which row the reader picked', async () => {
    const onSelect = vi.fn();
    render(table({ onSelect }));
    await userEvent.click(screen.getByRole('row', { name: /analyst/ }));
    expect(onSelect).toHaveBeenCalledWith('2');
  });

  it('lets the keyboard open the editor of a row, without also selecting the row', async () => {
    const onSelect = vi.fn();
    const onEdit = vi.fn();
    render(table({ onSelect, onEdit }));
    screen.getByRole('button', { name: 'Edit analyst' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith('2');
    // A bubbled row click would close the form the editor just opened.
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('marks the selected row', () => {
    render(table({ selectedId: '2' }));
    expect(screen.getByRole('row', { name: /analyst/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('row', { name: /rootadmin/ })).not.toHaveAttribute('aria-current');
  });

  it('tags the signed in account and disables its lock', () => {
    render(table({ meId: '1' }));
    const mine = screen.getByRole('row', { name: /rootadmin/ });
    expect(within(mine).getByText('YOU')).toBeInTheDocument();
    expect(
      within(mine).getByRole('button', { name: 'You cannot lock your own account' }),
    ).toBeDisabled();
    const other = screen.getByRole('row', { name: /analyst/ });
    expect(within(other).queryByText('YOU')).not.toBeInTheDocument();
  });

  it('says the list is empty instead of showing an empty table', () => {
    render(table({ users: [] }));
    expect(screen.getByText(/no accounts yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('StatCards', () => {
  it('writes the numbers with English grouping', () => {
    render(<StatCards userTotal={1234} sessionTotal={5} roleBreakdown={null} />);
    expect(screen.getByText('1,234')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('shows an unavailable value, not zero, when a total is unknown', () => {
    render(<StatCards userTotal={3} sessionTotal={null} roleBreakdown={null} />);
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('shows a loading value that differs from unavailable', () => {
    render(<StatCards userTotal={undefined} sessionTotal={undefined} roleBreakdown={null} />);
    expect(screen.getAllByText('Loading…')).toHaveLength(2);
    expect(screen.queryByText('Unavailable')).not.toBeInTheDocument();
  });

  it('labels the role breakdown as counted from this page only', () => {
    render(<StatCards userTotal={9} sessionTotal={1} roleBreakdown="1 Superadmin · 2 User" />);
    expect(screen.getByText('On this page:')).toBeInTheDocument();
    expect(screen.getByText('1 Superadmin · 2 User')).toBeInTheDocument();
  });
});
