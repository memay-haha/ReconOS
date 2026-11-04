import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { NAV_ITEMS, Sidebar } from './sidebar';

let mockPath = '/users';
vi.mock('next/navigation', () => ({ usePathname: () => mockPath }));

// docs/design/screens/index.json minus S01, in that file's order, named by the glossary.
const EXPECTED_LABELS = [
  'Dashboard',
  'Theo dõi tài sản',
  'Domain',
  'Chi tiết domain',
  'Thư viện screenshot',
  'Chi tiết screenshot',
  'Program',
  'Chi tiết program',
  'Hàng đợi',
  'Quản lý program',
  'Tài khoản và phân quyền',
  'Tình trạng hệ thống',
  'Cấu hình Osmedeus',
  'Cấu hình Vigolium',
  'Tool module',
  'Finding',
];

describe('Sidebar', () => {
  it('lists every designed screen except the sign in one', () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual(EXPECTED_LABELS);
    expect(NAV_ITEMS.some((item) => item.label === 'Đăng nhập')).toBe(false);
  });

  it('only lets the reader reach a screen that exists', () => {
    render(<Sidebar />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/users');
  });

  it('renders a screen that is not built yet as plain text, not a control', () => {
    render(<Sidebar />);
    const pending = screen.getByText('Dashboard').closest('li') as HTMLElement;
    expect(within(pending).queryByRole('link')).toBeNull();
    expect(within(pending).queryByRole('button')).toBeNull();
  });

  it('says which batch brings each screen that is not built yet', () => {
    render(<Sidebar />);
    const pending = screen.getByText('Dashboard').closest('li');
    expect(pending).not.toBeNull();
    expect(within(pending as HTMLElement).getByText(/có ở đợt 10/i)).toBeInTheDocument();
  });

  it('marks the current screen for assistive technology', () => {
    render(<Sidebar />);
    expect(screen.getByRole('link', { name: /tài khoản/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('lets a narrow screen open and close the list from a menu button', async () => {
    render(<Sidebar />);
    const button = screen.getByRole('button', { name: /menu/i });
    const list = document.getElementById('sidebar-list') as HTMLElement;
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(list).toHaveClass('hidden');
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(list).not.toHaveClass('hidden');
  });

  it('does not mark a path that merely shares the prefix as current', () => {
    mockPath = '/usersfoo';
    render(<Sidebar />);
    expect(screen.getByRole('link', { name: /tài khoản/i })).not.toHaveAttribute('aria-current');
    mockPath = '/users';
  });

  it('keeps the account screen current on a nested path', () => {
    mockPath = '/users/42';
    render(<Sidebar />);
    expect(screen.getByRole('link', { name: /tài khoản/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
    mockPath = '/users';
  });
});
