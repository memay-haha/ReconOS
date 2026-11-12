'use client';

import { type ReactElement, useState } from 'react';

import { Pagination, useCursorStack } from '@/components/pagination';
import { useSystemSetting } from '@/lib/system';
import {
  USER_ROLES,
  type UserRole,
  type UserRow,
  useBulkRevokeSessions,
  userExportHref,
  useUsers,
} from '@/lib/users';

import { SessionPanel } from './session-panel';
import { UserForm } from './user-form';
import { ROLE, UserTable } from './user-table';

const COUNT = new Intl.NumberFormat('en-US');
// The contract's default page size (openapi `limit`); the screen sends no limit.
const DEFAULT_LIMIT = 50;
// docs/ops/configuration.md: the default of `user_idle_after_minutes` when it is not set.
const IDLE_AFTER_DEFAULT = 15;

/** "1 Superadmin · 2 User", over every account. Null when there are none. */
export function roleBreakdown(counts: Readonly<Record<UserRole, number>>): string | null {
  const parts = USER_ROLES.filter((role) => counts[role] > 0).map(
    (role) => `${COUNT.format(counts[role])} ${ROLE[role].label}`,
  );
  return parts.length === 0 ? null : parts.join(' · ');
}

const PILL = 'rounded-sm px-2.5 py-1 font-caption text-caption';
const PILL_ON = `${PILL} border border-accent-soft-bd bg-surface-3 font-semibold text-primary`;
const PILL_OFF = `${PILL} text-fg-muted transition-colors hover:bg-surface-container hover:text-fg`;
const FIELD =
  'h-8 rounded-sm border border-border-strong bg-surface-2 text-fg focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring';

export function AccountsTab({
  meId,
  isSuperadmin,
  counts,
  creating,
  onCreateDone,
}: {
  meId: string | null;
  isSuperadmin: boolean;
  /** `role_counts` of the unfiltered list, for the pills. */
  counts: Readonly<Record<UserRole, number>> | undefined;
  creating: boolean;
  onCreateDone: () => void;
}): ReactElement {
  const { cursor, canGoBack, depth, goNext, goBack, reset } = useCursorStack();
  const [q, setQ] = useState('');
  const [role, setRole] = useState<UserRole | null>(null);
  const filter = { q: q.trim() === '' ? null : q.trim(), role };
  const users = useUsers(cursor, filter);
  const idle = useSystemSetting('user_idle_after_minutes', isSuperadmin);
  const bulkRevoke = useBulkRevokeSessions();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const selectedUser = users.data?.items.find((row) => row.id === selectedId) ?? null;
  const idleAfter = typeof idle.data?.value === 'number' ? idle.data.value : IDLE_AFTER_DEFAULT;

  // Once the selected row leaves the visible page, paged away or deleted, nothing on
  // screen names the account, so its details and edit form must go with it.
  // Render phase on purpose: an effect would paint one frame of a panel for an
  // account that is no longer on screen.
  if (selectedId !== null && users.data !== undefined && selectedUser === null) {
    setSelectedId(null);
    setEditing(false);
  }

  // A filter change invalidates every cursor and every ticked row.
  const refilter = (apply: () => void) => {
    apply();
    reset();
    setChecked(new Set());
    setEditing(false);
  };
  const toggle = (id: string) =>
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = (all: boolean, rows: readonly UserRow[]) =>
    setChecked(all ? new Set(rows.map((row) => row.id)) : new Set());

  const total = counts === undefined ? null : USER_ROLES.reduce((sum, r) => sum + counts[r], 0);
  const pills: { role: UserRole | null; label: string; count: number | null }[] = [
    { role: null, label: 'All', count: total },
    ...USER_ROLES.map((r) => ({ role: r, label: ROLE[r].label, count: counts?.[r] ?? null })),
  ];
  const ids = Array.from(checked);

  return (
    <>
      <div className="flex flex-col items-stretch justify-between gap-space-sm rounded-sm border border-border bg-surface p-space-sm lg:flex-row lg:items-center">
        <div className="flex flex-1 items-center gap-space-sm">
          <div className="relative max-w-lg flex-1">
            <span
              aria-hidden="true"
              className="material-symbols-outlined pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[17px] text-fg-faint"
            >
              search
            </span>
            <input
              type="search"
              aria-label="Filter accounts"
              placeholder="Filter accounts by username or display name..."
              value={q}
              onChange={(event) => refilter(() => setQ(event.target.value))}
              className={`${FIELD} w-full pl-8 pr-2.5 font-body-code text-body-code placeholder:text-fg-faint`}
            />
          </div>
          <div className="relative">
            <select
              aria-label="Role"
              value={role ?? ''}
              onChange={(event) =>
                refilter(() =>
                  setRole(event.target.value === '' ? null : (event.target.value as UserRole)),
                )
              }
              className={`${FIELD} cursor-pointer appearance-none pl-2.5 pr-8 font-body-default text-body-default`}
            >
              <option value="">All roles</option>
              {USER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE[r].label}
                </option>
              ))}
            </select>
            <span
              aria-hidden="true"
              className="material-symbols-outlined pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[16px] text-fg-faint"
            >
              expand_more
            </span>
          </div>
        </div>
        <div className="flex items-center gap-space-xs overflow-x-auto pt-1 lg:pt-0">
          <div className="flex items-center rounded-sm border border-border bg-surface-2 p-0.5">
            {pills.map((pill) => (
              <button
                key={pill.label}
                type="button"
                aria-pressed={role === pill.role}
                onClick={() => refilter(() => setRole(pill.role))}
                className={role === pill.role ? PILL_ON : PILL_OFF}
              >
                {pill.count === null ? pill.label : `${pill.label} (${COUNT.format(pill.count)})`}
              </button>
            ))}
          </div>
          <div aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
          <span className="whitespace-nowrap px-1 font-body-code text-[11px] text-fg-faint">
            {total === null
              ? ''
              : `${COUNT.format(total)} ${total === 1 ? 'account' : 'accounts'} registered`}
          </span>
        </div>
      </div>

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
                meId={meId}
                checked={checked}
                canWrite={isSuperadmin}
                idleAfterMinutes={idleAfter}
                onToggle={toggle}
                onToggleAll={(all) => toggleAll(all, users.data.items)}
                onSelect={(id) => {
                  setSelectedId(id);
                  setEditing(false);
                }}
                onEdit={(id) => {
                  setSelectedId(id);
                  setEditing(true);
                  onCreateDone();
                }}
              />
              <div className="border-t border-border bg-surface-2 px-3.5">
                <Pagination
                  label="Account list pagination"
                  page={{
                    total: users.data.total,
                    totalIsEstimate: users.data.total_is_estimate,
                    nextCursor: users.data.next_cursor,
                  }}
                  shown={users.data.items.length}
                  start={depth * DEFAULT_LIMIT + 1}
                  noun="accounts"
                  canGoBack={canGoBack}
                  onBack={() => {
                    goBack();
                    setEditing(false);
                  }}
                  onNext={() => {
                    goNext(users.data.next_cursor);
                    setEditing(false);
                  }}
                >
                  {/* The mockup puts the bulk actions beside the count. */}
                  {isSuperadmin && (
                    <span className="font-caption text-caption text-fg-faint">
                      <span aria-hidden="true" className="mr-space-sm hidden sm:inline">
                        ·
                      </span>
                      Bulk actions:
                      <a
                        href={userExportHref(filter, ids)}
                        download
                        className="ml-1 text-primary hover:underline"
                      >
                        Export CSV
                      </a>
                      {' / '}
                      <button
                        type="button"
                        disabled={ids.length === 0 || bulkRevoke.isPending}
                        title={ids.length === 0 ? 'Select accounts first' : undefined}
                        onClick={() =>
                          bulkRevoke.mutate(ids, { onSuccess: () => setChecked(new Set()) })
                        }
                        className="ml-1 text-crit hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Force Session Kill
                      </button>
                      {bulkRevoke.isError && (
                        <span role="alert" className="ml-2 text-crit">
                          Could not revoke the sessions.
                        </span>
                      )}
                    </span>
                  )}
                </Pagination>
              </div>
            </>
          )}
        </div>
        {(creating || selectedUser !== null) && (
          <section
            aria-label={creating ? 'New account' : 'Account details'}
            className="flex w-full flex-col gap-space-md rounded-sm border border-border bg-surface p-space-md xl:w-96 xl:shrink-0"
          >
            {creating ? (
              <>
                <h2 className="text-panel-title text-fg">New account</h2>
                <UserForm mode="create" onDone={onCreateDone} />
              </>
            ) : (
              selectedUser !== null && (
                <>
                  <h2 className="text-panel-title text-fg">{selectedUser.display_name}</h2>
                  {editing && (
                    <UserForm
                      key={selectedUser.id}
                      mode="edit"
                      user={selectedUser}
                      onDone={() => setEditing(false)}
                    />
                  )}
                  <h3 className="text-label-caps uppercase text-fg-muted">Sessions</h3>
                  <SessionPanel key={selectedUser.id} userId={selectedUser.id} />
                </>
              )
            )}
          </section>
        )}
      </div>
    </>
  );
}
