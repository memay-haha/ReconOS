'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { ReactElement } from 'react';

import { Pagination, useCursorStack } from '@/components/pagination';
import { useMe } from '@/lib/auth';
import { useActiveSessionCount } from '@/lib/sessions';
import { type UserRow, useUsers } from '@/lib/users';

import { SessionPanel } from './session-panel';
import { StatCards } from './stat-cards';
import { UserForm } from './user-form';
import { UserTable } from './user-table';

const ROLE_ORDER: readonly { role: UserRow['role']; label: string }[] = [
  { role: 'superadmin', label: 'Superadmin' },
  { role: 'admin', label: 'Admin' },
  { role: 'user', label: 'User' },
];

/** "1 Superadmin · 2 User", from the rows on screen. Null when there are none. */
function roleBreakdown(rows: readonly UserRow[]): string | null {
  const parts = ROLE_ORDER.map(({ role, label }) => ({
    label,
    count: rows.filter((row) => row.role === role).length,
  }))
    .filter(({ count }) => count > 0)
    .map(({ label, count }) => `${count} ${label}`);
  return parts.length === 0 ? null : parts.join(' · ');
}

const HEADER_BUTTON =
  'inline-flex h-9 items-center gap-space-sm rounded-sm px-space-lg text-body-default focus:outline-none focus:ring-2 focus:ring-ring';

export default function UsersPage(): ReactElement {
  const { cursor, canGoBack, goNext, goBack } = useCursorStack();
  const users = useUsers(cursor);
  const sessionCount = useActiveSessionCount();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const me = useMe();
  const selectedUser = users.data?.items.find((row) => row.id === selectedId) ?? null;

  // An edit form belongs to one selected account; any move away from it closes the form.
  const closeEdit = () => setFormMode((mode) => (mode === 'edit' ? null : mode));

  // Once the selected row leaves the visible page, paged away or deleted, nothing on
  // screen names the account, so its details and edit form must go with it.
  // Render phase on purpose: an effect would paint one frame of a panel for an
  // account that is no longer on screen.
  if (selectedId !== null && users.data !== undefined && selectedUser === null) {
    setSelectedId(null);
    closeEdit();
  }

  return (
    <div className="flex w-full flex-col gap-space-lg">
      <div className="flex flex-col justify-between gap-space-md pt-space-xs md:flex-row md:items-end">
        <div className="flex flex-col gap-space-xs">
          <div className="flex items-center gap-space-sm text-caption text-fg-faint">
            <span>ReconOS</span>
            <span aria-hidden="true">/</span>
            <span>Admin</span>
            <span aria-hidden="true">/</span>
            <span className="text-body-code text-primary">Users &amp; Access</span>
          </div>
          <h1 className="text-headline-lg text-fg">Users &amp; Access Control</h1>
          <p className="max-w-2xl text-body-default text-fg-muted">
            Accounts, roles, locks and login sessions.
          </p>
        </div>
        <div className="flex items-center gap-space-sm self-start md:self-auto">
          <Link
            href="/audit-log"
            className={`${HEADER_BUTTON} border border-border-strong bg-surface text-fg hover:bg-surface-2`}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-icon text-fg-muted">
              history_toggle_off
            </span>
            Audit Logs
          </Link>
          <button
            type="button"
            onClick={() => setFormMode('create')}
            className={`${HEADER_BUTTON} bg-primary-container font-semibold text-accent-ink hover:bg-accent-hover`}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-icon">
              person_add
            </span>
            Add account
          </button>
        </div>
      </div>

      {formMode === 'create' && <UserForm mode="create" onDone={() => setFormMode(null)} />}
      {/* Edit needs a real account: when the selection clears (paged away, row gone), no form. */}
      {formMode === 'edit' && selectedUser !== null && (
        <UserForm
          key={selectedUser.id}
          mode="edit"
          user={selectedUser}
          onDone={() => setFormMode(null)}
        />
      )}

      <StatCards
        userTotal={users.isPending ? undefined : (users.data?.total ?? null)}
        sessionTotal={sessionCount.isPending ? undefined : (sessionCount.data ?? null)}
        roleBreakdown={users.data === undefined ? null : roleBreakdown(users.data.items)}
      />

      <div className="flex w-full flex-col items-start gap-space-md xl:flex-row">
        <div className="w-full overflow-hidden rounded-sm border border-border bg-surface">
          {users.isPending && (
            <p className="px-space-md py-space-xl text-body-default text-fg-muted">
              Loading the account list…
            </p>
          )}
          {users.isError && (
            <p role="alert" className="px-space-md py-space-xl text-body-default text-crit">
              Could not load the account list.
            </p>
          )}
          {users.data !== undefined && (
            <>
              <UserTable
                users={users.data.items}
                selectedId={selectedId}
                meId={me.data?.id ?? null}
                onSelect={(id) => {
                  setSelectedId(id);
                  closeEdit();
                }}
                onEdit={(id) => {
                  setSelectedId(id);
                  setFormMode('edit');
                }}
              />
              <div className="border-t border-border bg-surface-2 px-space-md">
                <Pagination
                  label="Account list pagination"
                  page={{
                    total: users.data.total,
                    totalIsEstimate: users.data.total_is_estimate,
                    nextCursor: users.data.next_cursor,
                  }}
                  canGoBack={canGoBack}
                  onBack={() => {
                    goBack();
                    closeEdit();
                  }}
                  onNext={() => {
                    goNext(users.data.next_cursor);
                    closeEdit();
                  }}
                />
              </div>
            </>
          )}
        </div>
        {selectedUser !== null && (
          <section
            aria-label="Account details"
            className="flex w-full flex-col gap-space-md rounded-sm border border-border bg-surface p-space-md xl:w-96"
          >
            <h2 className="text-panel-title text-fg">{selectedUser.display_name}</h2>
            <h3 className="text-label-caps uppercase text-fg-muted">Sessions</h3>
            <SessionPanel key={selectedUser.id} userId={selectedUser.id} />
          </section>
        )}
      </div>
    </div>
  );
}
