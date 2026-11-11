'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import type { CurrentUser } from '@/lib/auth';
import { versionLabel } from '@/lib/build-info';

import { ChangePasswordDialog } from './change-password-dialog';
import { NAV_GROUPS, badgeKey, isCurrent } from './nav-items';
import type { NavBadge, NavItem } from './nav-items';

const ROLE_LABEL: Record<CurrentUser['role'], string> = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  user: 'User',
};

const BADGE_TONE: Record<NavBadge['tone'], string> = {
  crit: 'border-crit-strong-bd bg-crit-strong-soft text-crit-strong font-semibold',
  warn: 'border-warn-strong-bd bg-warn-strong-soft text-warn font-semibold',
  neutral: 'border-border-subtle bg-surface-container-low text-fg-muted',
};

// Decision N3: every version chip shows the ReconOS build version.
const VERSION = versionLabel();

const ROW = 'flex items-center justify-between rounded-sm px-2.5 py-1.5 text-body-default';

function Icon({ name }: { name: string }) {
  return (
    <span aria-hidden="true" className="material-symbols-outlined text-icon">
      {name}
    </span>
  );
}

const COUNT = new Intl.NumberFormat('en-US');

function Count({ badge, value }: { badge: NavBadge; value: number }) {
  return (
    <span
      className={`rounded-sm border px-1.5 font-body-code text-caption ${BADGE_TONE[badge.tone]}`}
    >
      {COUNT.format(value)}
    </span>
  );
}

function Row({
  item,
  href,
  current,
  count,
}: {
  item: NavItem;
  href: string;
  current: boolean;
  count: number | undefined;
}) {
  const badge =
    item.badge !== undefined && count !== undefined ? (
      <Count badge={item.badge} value={count} />
    ) : null;
  const label = (
    <span className="flex items-center gap-2">
      <Icon name={item.icon} />
      <span>{item.label}</span>
    </span>
  );

  return (
    <Link
      href={href}
      aria-current={current ? 'page' : undefined}
      className={`${ROW} border text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg aria-[current=page]:border-accent-soft-bd aria-[current=page]:bg-accent-soft aria-[current=page]:font-medium aria-[current=page]:text-primary border-transparent`}
    >
      {label}
      {/* Count and current-screen dot share the right edge, so a counted screen that is
          current keeps its count at the edge too. */}
      <span className="ml-auto flex items-center gap-2">
        {badge}
        {current ? (
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-primary-container shadow-active-dot"
          />
        ) : null}
      </span>
    </Link>
  );
}

function AccountCard({
  user,
  onSignOut,
  onChangePassword,
  signOutFailed,
}: {
  user: CurrentUser;
  onSignOut: () => void;
  onChangePassword: () => void;
  signOutFailed: boolean;
}) {
  return (
    <div className="mt-gutter border-t border-border-subtle/60 pt-space-md">
      <div className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-dim p-space-md">
        <div className="flex min-w-0 items-center gap-2">
          <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-border-raised bg-surface-container text-fg-muted">
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
            <span className="text-micro text-fg-dim">{ROLE_LABEL[user.role]}</span>
          </span>
        </div>
        <div className="flex items-center">
          <button
            type="button"
            aria-label="Change password"
            onClick={onChangePassword}
            className="rounded-sm p-1 text-fg-dim hover:bg-surface-container hover:text-fg"
          >
            <Icon name="key" />
          </button>
          <button
            type="button"
            aria-label="Sign out"
            onClick={onSignOut}
            className="rounded-sm p-1 text-fg-dim hover:bg-surface-container hover:text-fg"
          >
            <Icon name="logout" />
          </button>
        </div>
      </div>
      {signOutFailed ? (
        <p role="alert" className="mt-space-xs text-caption text-error">
          Could not sign out. Try again later.
        </p>
      ) : null}
    </div>
  );
}

/** Screens with an href, by group; a group left with none is dropped. A screen no part has
 * built yet stays in nav-items.ts as a placeholder but is not shown to the reader. */
const VISIBLE_GROUPS = NAV_GROUPS.map((group) => ({
  ...group,
  items: group.items.flatMap((item) => (item.href === null ? [] : [{ item, href: item.href }])),
})).filter((group) => group.items.length > 0);

export function Sidebar({
  user,
  counts,
  toggled,
  onSignOut,
  signOutFailed,
}: {
  user: CurrentUser | null;
  counts: Record<string, number>;
  /** The topbar's menu button flipped the default: shown below md, hidden from md up. */
  toggled: boolean;
  onSignOut: () => void;
  signOutFailed: boolean;
}) {
  const pathname = usePathname();
  const [changingPassword, setChangingPassword] = useState(false);

  return (
    <>
      <aside
        id="sidebar"
        className={`${toggled ? 'flex md:hidden' : 'hidden md:flex'} fixed top-14 left-0 z-40 h-[calc(100vh-3.5rem)] w-sidebar flex-col justify-between border-r border-border bg-bg p-space-md select-none md:top-0 md:h-screen`}
      >
        <div className="flex flex-1 flex-col overflow-y-auto">
          <div className="mb-space-md flex items-center justify-between border-b border-border-subtle/60 pb-space-md">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="flex h-7 w-7 items-center justify-center rounded-sm bg-primary-container text-sm font-black text-accent-ink"
              >
                R
              </span>
              <span className="font-panel-title text-panel-title font-bold tracking-tight">
                <span className="text-fg">Recon</span>
                <span className="text-primary">OS</span>
              </span>
            </div>
            {VERSION === null ? null : (
              <span className="ml-auto rounded-sm border border-border bg-surface-container-low px-1.5 py-0.5 font-body-code text-micro text-fg-dim">
                {VERSION}
              </span>
            )}
          </div>
          <nav aria-label="Main" className="flex-1 space-y-gutter">
            {VISIBLE_GROUPS.map((group) => (
              <div key={group.heading ?? 'main'} className="space-y-space-xs">
                {group.heading === null ? null : (
                  <div className="flex items-center justify-between px-2 py-1">
                    <span className="text-micro font-semibold tracking-wider text-fg-dimmest uppercase">
                      {group.heading}
                    </span>
                    {group.tag === undefined ? null : (
                      <span className="rounded-sm border border-crit-strong-bd bg-crit-strong-soft px-1 font-body-code text-micro font-bold text-crit-strong">
                        {group.tag}
                      </span>
                    )}
                  </div>
                )}
                <ul className="space-y-space-xs">
                  {group.items.map(({ item, href }) => (
                    <li key={item.label}>
                      <Row
                        item={item}
                        href={href}
                        current={isCurrent(pathname, href)}
                        count={item.badge === undefined ? undefined : counts[badgeKey(item.badge)]}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        {user === null ? null : (
          <AccountCard
            user={user}
            onSignOut={onSignOut}
            onChangePassword={() => setChangingPassword(true)}
            signOutFailed={signOutFailed}
          />
        )}
      </aside>
      <ChangePasswordDialog open={changingPassword} onClose={() => setChangingPassword(false)} />
    </>
  );
}
