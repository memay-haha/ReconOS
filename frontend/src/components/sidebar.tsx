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
  { label: 'Dashboard', href: null, batch: 'Đợt 10' },
  { label: 'Asset Monitor', href: null, batch: 'Đợt 5' },
  { label: 'Domains', href: null, batch: 'Đợt 5' },
  { label: 'Domain Detail', href: null, batch: 'Đợt 5' },
  { label: 'Screenshot Gallery', href: null, batch: 'Đợt 7' },
  { label: 'Capture Detail', href: null, batch: 'Đợt 7' },
  { label: 'Programs', href: null, batch: 'Đợt 3' },
  { label: 'Program Detail', href: null, batch: 'Đợt 3' },
  { label: 'Staging Queue', href: null, batch: 'Đợt 4' },
  { label: 'Program Management', href: null, batch: 'Đợt 3' },
  { label: 'Users & Access Control', href: '/users', batch: 'Đợt 2' },
  { label: 'System Health & Tools', href: null, batch: 'Đợt 4' },
  { label: 'Osmedeus Settings', href: null, batch: 'Đợt 5' },
  { label: 'Vigolium Settings', href: null, batch: 'Đợt 9' },
  { label: 'Modules Recon Capabilities', href: null, batch: 'Đợt 4' },
  { label: 'Global Findings Explorer', href: null, batch: 'Đợt 6' },
];

// Segment-aware: /users and /users/42 match /users, /usersfoo does not.
function isCurrent(pathname: string | null, href: string): boolean {
  return pathname === href || (pathname?.startsWith(`${href}/`) ?? false);
}

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
                <span className="text-caption text-fg-muted">Có ở {item.batch}</span>
              </span>
            ) : (
              <Link
                href={item.href}
                aria-current={isCurrent(pathname, item.href) ? 'page' : undefined}
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
