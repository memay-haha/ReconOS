'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ReactElement, useState } from 'react';

import { useMe } from '@/lib/auth';
import { versionLabel } from '@/lib/build-info';
import { useActiveSessionSummary } from '@/lib/sessions';
import { useUsers } from '@/lib/users';

import { AccountsTab, roleBreakdown } from './accounts-tab';
import { RoleMatrixTab } from './role-matrix-tab';
import { SessionsTab } from './sessions-tab';
import { StatCards } from './stat-cards';

// Header buttons as the mockup draws them (M7): h-9, tight side padding, a small shadow.
const HEADER_BUTTON =
  'inline-flex h-9 items-center gap-2 rounded-sm px-3.5 font-body-default text-body-default shadow-sm focus:outline-none focus:ring-2 focus:ring-ring';

const TABS = [
  { id: 'accounts', label: 'Accounts & Roles', icon: 'account_box' },
  { id: 'sessions', label: 'Active Sessions', icon: 'devices' },
  { id: 'roles', label: 'Role Matrix', icon: 'grid_view' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const TAB =
  'flex items-center gap-2 whitespace-nowrap px-3.5 py-2.5 font-panel-title text-panel-title';
const TAB_ON = `${TAB} border-b-2 border-primary font-semibold text-primary`;
const TAB_OFF = `${TAB} text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg`;
const BADGE_ON =
  'rounded-sm border border-accent-soft-bd bg-surface-3 px-1.5 font-body-code text-[10px] text-primary';
const BADGE_GOOD =
  'rounded-sm border border-good-bd bg-good-soft px-1.5 font-body-code text-[10px] text-good';
const BADGE_OFF =
  'rounded-sm border border-border bg-surface-2 px-1.5 font-body-code text-[10px] text-fg-faint';

const COUNT = new Intl.NumberFormat('en-US');

export default function UsersPage(): ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const me = useMe();
  const isSuperadmin = me.data?.role === 'superadmin';
  // The tiles count every account: the unfiltered first page carries the totals.
  const totals = useUsers(null);
  const sessions = useActiveSessionSummary(isSuperadmin);
  // The header button opens the drawer that the accounts tab draws beside its table.
  const [creating, setCreating] = useState(false);

  const asked = params?.get('tab');
  // Sessions and the role matrix are Superadmin reads: hiding them is a convenience.
  const tab: TabId =
    isSuperadmin && (asked === 'sessions' || asked === 'roles') ? asked : 'accounts';
  const openTab = (id: TabId) =>
    router.replace(
      id === 'accounts' ? (pathname ?? '/users') : `${pathname ?? '/users'}?tab=${id}`,
    );

  const counts = totals.data?.role_counts;
  const version = versionLabel();
  const tabs = TABS.filter((t) => t.id === 'accounts' || isSuperadmin);

  return (
    <div className="flex w-full flex-col gap-space-lg">
      <div className="flex flex-col justify-between gap-space-md pt-2 md:flex-row md:items-end">
        <div className="flex flex-col space-y-1">
          <div className="flex items-center gap-2 font-caption text-caption text-fg-faint">
            <span>ReconOS</span>
            <span aria-hidden="true" className="text-[9px] opacity-60">
              /
            </span>
            <span>Admin</span>
            <span aria-hidden="true" className="text-[9px] opacity-60">
              /
            </span>
            <span className="font-body-code text-primary">Users &amp; Access</span>
          </div>
          <h1 className="flex items-center gap-space-sm font-headline-lg text-headline-lg tracking-tight text-fg">
            Users &amp; Access Control
            {version !== null && (
              <span className="rounded-sm border border-accent-soft-bd bg-surface-container-high px-2 py-0.5 font-body-code text-[10px] text-primary">
                {version}
              </span>
            )}
          </h1>
          <p className="max-w-2xl font-body-default text-body-default text-fg-muted">
            Operator accounts, role-based access control (RBAC) and active login sessions.
          </p>
        </div>
        <div className="flex items-center gap-space-sm self-start md:self-auto">
          <Link
            href="/audit-log"
            className={`${HEADER_BUTTON} border border-border-strong bg-surface text-fg hover:bg-surface-2`}
          >
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[17px] text-fg-muted"
            >
              history_toggle_off
            </span>
            <span>Audit Logs</span>
          </Link>
          {isSuperadmin && (
            <button
              type="button"
              onClick={() => {
                if (tab !== 'accounts') openTab('accounts');
                setCreating(true);
              }}
              className={`${HEADER_BUTTON} gap-1.5 bg-primary-container font-semibold text-accent-ink hover:bg-accent-hover`}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                person_add
              </span>
              <span>New account</span>
            </button>
          )}
        </div>
      </div>

      <StatCards
        userTotal={totals.isPending ? undefined : (totals.data?.total ?? null)}
        sessionTotal={
          me.isPending || (isSuperadmin && sessions.isPending)
            ? undefined
            : (sessions.data?.total ?? null)
        }
        sessionAccounts={sessions.data?.accountCount ?? null}
        lockedTotal={totals.isPending ? undefined : (totals.data?.locked_count ?? null)}
        roleBreakdown={counts === undefined ? null : roleBreakdown(counts)}
      />

      <div className="flex items-center justify-between border-b border-border">
        <div
          role="tablist"
          aria-label="Access views"
          className="flex items-center gap-space-xs overflow-x-auto"
        >
          {tabs.map((item) => {
            const on = item.id === tab;
            const count =
              item.id === 'accounts'
                ? (totals.data?.total ?? null)
                : item.id === 'sessions'
                  ? (sessions.data?.total ?? null)
                  : null;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => openTab(item.id)}
                className={on ? TAB_ON : TAB_OFF}
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                  {item.icon}
                </span>
                <span>{item.label}</span>
                {count !== null && (
                  <span className={on ? BADGE_ON : item.id === 'sessions' ? BADGE_GOOD : BADGE_OFF}>
                    {COUNT.format(count)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {tab === 'accounts' && (
        <AccountsTab
          meId={me.data?.id ?? null}
          isSuperadmin={isSuperadmin}
          counts={counts}
          creating={creating}
          onCreateDone={() => setCreating(false)}
        />
      )}
      {tab === 'sessions' && <SessionsTab />}
      {tab === 'roles' && <RoleMatrixTab />}
    </div>
  );
}
