'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

export interface NavItem {
  readonly label: string;
  /** null until the batch named below builds the screen. */
  readonly href: string | null;
  readonly batch: string;
}

// The screens in docs/design/screens/index.json minus S01, in that order.
export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Tổng quan', href: null, batch: 'Đợt 10' },
  { label: 'Theo dõi tài sản', href: null, batch: 'Đợt 5' },
  { label: 'Domain', href: null, batch: 'Đợt 5' },
  { label: 'Chi tiết domain', href: null, batch: 'Đợt 5' },
  { label: 'Thư viện screenshot', href: null, batch: 'Đợt 7' },
  { label: 'Chi tiết screenshot', href: null, batch: 'Đợt 7' },
  { label: 'Program', href: null, batch: 'Đợt 3' },
  { label: 'Chi tiết program', href: null, batch: 'Đợt 3' },
  { label: 'Hàng đợi job', href: null, batch: 'Đợt 4' },
  { label: 'Quản lý program', href: null, batch: 'Đợt 3' },
  { label: 'Tài khoản và phân quyền', href: '/users', batch: 'Đợt 2' },
  { label: 'Tình trạng hệ thống', href: null, batch: 'Đợt 4' },
  { label: 'Cấu hình Osmedeus', href: null, batch: 'Đợt 5' },
  { label: 'Cấu hình Vigolium', href: null, batch: 'Đợt 9' },
  { label: 'Tool module', href: null, batch: 'Đợt 4' },
  { label: 'Finding', href: null, batch: 'Đợt 6' },
];

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <nav
      aria-label="Điều hướng chính"
      className="w-full shrink-0 border-b border-border bg-surface md:w-64 md:border-r md:border-b-0"
    >
      {/* Below md the list folds behind this button so it never squeezes the content. */}
      <button
        type="button"
        aria-expanded={open}
        aria-controls="sidebar-list"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-space-md py-space-sm text-fg hover:bg-surface-container-high md:hidden"
      >
        Menu
        <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      <ul
        id="sidebar-list"
        className={`${open ? 'flex' : 'hidden'} flex-col gap-space-xs p-space-sm md:flex`}
      >
        {NAV_ITEMS.map((item) => (
          <li key={item.label}>
            {item.href === null ? (
              <span className="flex flex-col rounded-md px-space-sm py-space-xs text-fg-muted">
                {item.label}
                <span className="text-caption text-fg-muted">{item.batch}</span>
              </span>
            ) : (
              <Link
                href={item.href}
                aria-current={pathname?.startsWith(item.href) ? 'page' : undefined}
                className="block rounded-md px-space-sm py-space-xs text-fg hover:bg-surface-container-high aria-[current=page]:bg-accent-soft"
              >
                {item.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
