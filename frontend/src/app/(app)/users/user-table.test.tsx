import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { UserRow } from '@/lib/users';

import { StatCards } from './stat-cards';
import { UserTable } from './user-table';

const ROWS: UserRow[] = [
  {
    id: '1',
    username: 'rootadmin',
    display_name: 'Quản trị gốc',
    role: 'superadmin',
    is_locked: false,
    created_at: '2026-11-04T08:00:00Z',
    last_login_at: '2026-11-04T09:30:00Z',
  },
  {
    id: '2',
    username: 'analyst',
    display_name: 'Người phân tích',
    role: 'user',
    is_locked: true,
    created_at: '2026-11-04T08:00:00Z',
    last_login_at: null,
  },
];

describe('UserTable', () => {
  it('writes each role with its glossary name', () => {
    render(<UserTable users={ROWS} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getByText('Superadmin')).toBeInTheDocument();
    expect(screen.getByText('User')).toBeInTheDocument();
  });

  it('marks a locked account', () => {
    render(<UserTable users={ROWS} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getByText('Đã khóa')).toBeInTheDocument();
    expect(screen.getByText('Hoạt động')).toBeInTheDocument();
  });

  it('says so when an account has never signed in', () => {
    render(<UserTable users={ROWS} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getByText('Chưa đăng nhập')).toBeInTheDocument();
  });

  it('renders the last sign-in as dd/mm/yyyy HH:mm', () => {
    const row: UserRow = { ...ROWS[0]!, last_login_at: '2026-11-04T08:30:00Z' };
    render(<UserTable users={[row]} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getByText('04/11/2026 15:30')).toBeInTheDocument();
  });

  it('reports which row the reader picked', async () => {
    const onSelect = vi.fn();
    render(<UserTable users={ROWS} selectedId={null} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('row', { name: /analyst/ }));
    expect(onSelect).toHaveBeenCalledWith('2');
  });

  it('lets the keyboard pick a row', async () => {
    const onSelect = vi.fn();
    render(<UserTable users={ROWS} selectedId={null} onSelect={onSelect} />);
    screen.getByRole('button', { name: 'analyst' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('2');
  });

  it('marks the selected row', () => {
    render(<UserTable users={ROWS} selectedId="2" onSelect={vi.fn()} />);
    expect(screen.getByRole('row', { name: /analyst/ })).toHaveAttribute('aria-current', 'true');
  });

  it('says the list is empty instead of showing an empty table', () => {
    render(<UserTable users={[]} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getByText(/chưa có tài khoản nào/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('StatCards', () => {
  it('writes the numbers with Vietnamese grouping', () => {
    render(<StatCards userTotal={1234} sessionTotal={5} />);
    expect(screen.getByText('1.234')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('shows an unavailable value, not zero, when a total is unknown', () => {
    render(<StatCards userTotal={3} sessionTotal={null} />);
    expect(screen.getByText('Không khả dụng')).toBeInTheDocument();
  });
});
