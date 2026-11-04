import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { NAV_ITEMS, Sidebar } from './sidebar';

vi.mock('next/navigation', () => ({ usePathname: () => '/users' }));

describe('Sidebar', () => {
  it('lists every designed screen except the sign in one', () => {
    expect(NAV_ITEMS).toHaveLength(16);
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
    const pending = screen.getByText('Tổng quan').closest('li') as HTMLElement;
    expect(within(pending).queryByRole('link')).toBeNull();
    expect(within(pending).queryByRole('button')).toBeNull();
  });

  it('says which batch brings each screen that is not built yet', () => {
    render(<Sidebar />);
    const pending = screen.getByText('Tổng quan').closest('li');
    expect(pending).not.toBeNull();
    expect(within(pending as HTMLElement).getByText(/đợt 10/i)).toBeInTheDocument();
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
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });
});
