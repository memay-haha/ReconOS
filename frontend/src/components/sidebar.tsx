'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import type { CurrentUser } from '@/lib/auth';

import { NAV_GROUPS } from './nav-items';
import type { NavItem } from './nav-items';

const ROLE_LABEL: Record<CurrentUser['role'], string> = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  user: 'User',
};

// The mockup colours the count of unreviewed findings and of queued jobs; the rest are neutral.
const BADGE_TONE: Record<string, string> = {
  '/findings?triage_status=new':
    'border-crit-strong-bd bg-crit-strong-soft text-crit-strong font-semibold',
  '/jobs?status=queued': 'border-warn-strong-bd bg-warn-strong-soft text-warn font-semibold',
};
const BADGE_NEUTRAL = 'border-border-subtle bg-surface-container-low text-fg-muted';

const ROW = 'flex items-center justify-between rounded px-2.5 py-1.5 text-body-default';

// Segment-aware: /users and /users/42 match /users, /usersfoo does not.
function isCurrent(pathname: string | null, href: string): boolean {
  return pathname === href || (pathname?.startsWith(`${href}/`) ?? false);
}

function Icon({ name }: { name: string }) {
  return (
    <span aria-hidden="true" className="material-symbols-outlined text-[17px]">
      {name}
    </span>
  );
}

function Count({ endpoint, value }: { endpoint: string; value: number }) {
  return (
    <span
      className={`rounded border px-1.5 font-body-code text-caption ${BADGE_TONE[endpoint] ?? BADGE_NEUTRAL}`}
    >
      {value}
    </span>
  );
}

function Row({
  item,
  current,
  count,
}: {
  item: NavItem;
  current: boolean;
  count: number | undefined;
}) {
  const badge =
    item.badge !== undefined && count !== undefined ? (
      <Count endpoint={item.badge} value={count} />
    ) : null;
  const label = (
    <span className="flex items-center gap-2">
      <Icon name={item.icon} />
      <span>{item.label}</span>
    </span>
  );

  // A screen no part has built yet is text, not a control: nothing for the keyboard to land on.
  if (item.href === null) {
    return (
      <span className={`${ROW} text-fg-dim`}>
        {label}
        <span className="flex items-center gap-2">
          {badge}
          <span aria-hidden="true" className="text-caption">
            {item.part}
          </span>
          <span className="sr-only">, available in {item.part}</span>
        </span>
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      aria-current={current ? 'page' : undefined}
      className={`${ROW} border text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg aria-[current=page]:border-accent-soft-bd aria-[current=page]:bg-accent-soft aria-[current=page]:font-medium aria-[current=page]:text-primary border-transparent`}
    >
      {label}
      {badge}
      {current ? (
        <span
          aria-hidden="true"
          className="ml-auto h-1.5 w-1.5 rounded-full bg-primary-container shadow-[0_0_6px_var(--color-primary-container)]"
        />
      ) : null}
    </Link>
  );
}

function AccountCard({
  user,
  onSignOut,
  signOutFailed,
}: {
  user: CurrentUser;
  onSignOut: () => void;
  signOutFailed: boolean;
}) {
  return (
    <div className="mt-gutter border-t border-border-subtle/60 pt-space-md">
      <div className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-dim p-space-md">
        <div className="flex min-w-0 items-center gap-2">
          <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border-raised bg-surface-container text-fg-muted">
            <Icon name="terminal" />
            <span
              aria-hidden="true"
              className="absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full border-2 border-surface-dim bg-good"
            />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-body-code text-body-code text-fg">
              {user.display_name}
            </span>
            <span className="text-caption text-fg-dim">{ROLE_LABEL[user.role]}</span>
          </span>
        </div>
        <button
          type="button"
          aria-label="Sign out"
          onClick={onSignOut}
          className="rounded p-1 text-fg-dim hover:bg-surface-container hover:text-fg"
        >
          <Icon name="logout" />
        </button>
      </div>
      {signOutFailed ? (
        <p role="alert" className="mt-space-xs text-caption text-error">
          Could not sign out. Try again later.
        </p>
      ) : null}
    </div>
  );
}

export function Sidebar({
  user,
  counts,
  onSignOut,
  signOutFailed,
}: {
  user: CurrentUser | null;
  counts: Record<string, number>;
  onSignOut: () => void;
  signOutFailed: boolean;
}) {
  const pathname = usePathname();
  // Below md the 244 px column would leave a phone about 146 px of content, so it folds
  // behind a Menu button. From md up it is the column the mockup draws.
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="sidebar"
        aria-label="Menu"
        onClick={() => setOpen((value) => !value)}
        className="fixed top-0 left-0 z-50 flex h-14 w-14 items-center justify-center text-fg-muted hover:text-fg md:hidden"
      >
        <Icon name={open ? 'close' : 'menu'} />
      </button>
      <aside
        id="sidebar"
        className={`${open ? 'flex' : 'hidden'} fixed top-0 left-0 z-40 h-screen w-sidebar flex-col justify-between border-r border-border bg-bg p-space-md pt-16 select-none md:flex md:pt-space-md`}
      >
        <div className="flex flex-1 flex-col overflow-y-auto">
          <div className="mb-space-md flex items-center justify-between border-b border-border-subtle/60 pb-space-md">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="flex h-7 w-7 items-center justify-center rounded bg-primary-container text-sm font-black text-accent-ink"
              >
                R
              </span>
              <span className="font-panel-title text-panel-title font-bold tracking-tight">
                <span className="text-fg">Recon</span>
                <span className="text-primary">OS</span>
              </span>
            </div>
            <span className="ml-auto rounded border border-border bg-surface-container-low px-1.5 py-0.5 font-body-code text-caption text-fg-dim">
              v2.4
            </span>
          </div>
          <nav aria-label="Main" className="flex-1 space-y-gutter">
            {NAV_GROUPS.map((group) => (
              <div key={group.heading ?? 'main'} className="space-y-space-xs">
                {group.heading === null ? null : (
                  <div className="flex items-center justify-between px-2 py-1">
                    <span className="font-label-caps text-label-caps text-fg-dimmest uppercase">
                      {group.heading}
                    </span>
                    {group.tag === undefined ? null : (
                      <span className="rounded border border-crit-strong-bd bg-crit-strong-soft px-1 font-body-code text-caption font-bold text-crit-strong">
                        {group.tag}
                      </span>
                    )}
                  </div>
                )}
                <ul className="space-y-space-xs">
                  {group.items.map((item) => (
                    <li key={item.label}>
                      <Row
                        item={item}
                        current={item.href !== null && isCurrent(pathname, item.href)}
                        count={item.badge === undefined ? undefined : counts[item.badge]}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        {user === null ? null : (
          <AccountCard user={user} onSignOut={onSignOut} signOutFailed={signOutFailed} />
        )}
      </aside>
    </>
  );
}
