'use client';

import { type ReactElement, useState } from 'react';

import { formatAgo } from '@/lib/format-ago';
import { formatMoment } from '@/lib/format-moment';
import type { UserRow } from '@/lib/users';

import { ICON_BUTTON } from './icon-button';
import { UserActions } from './user-actions';

export const ROLE: Record<UserRow['role'], { label: string; icon: string; tone: string }> = {
  superadmin: {
    label: 'Superadmin',
    icon: 'terminal',
    tone: 'bg-accent-soft text-primary border-accent-soft-bd',
  },
  admin: { label: 'Admin', icon: 'shield', tone: 'bg-info-soft text-info border-info-bd' },
  user: {
    label: 'User',
    icon: 'visibility',
    tone: 'bg-neutral-soft text-fg-muted border-neutral-bd',
  },
};

function initials(row: UserRow): string {
  return (
    row.display_name.trim().slice(0, 2).toUpperCase() || row.username.slice(0, 2).toUpperCase()
  );
}

/** The Active Sessions cell: count, or Idle when the newest active session is older than
 * `user_idle_after_minutes` (M32), then the newest session's IP. */
function SessionCell({
  row,
  idleAfterMinutes,
  now,
}: {
  row: UserRow;
  idleAfterMinutes: number | null;
  now: number;
}): ReactElement {
  const count = row.active_user_session_count;
  if (count === 0) {
    return <span className="font-body-code text-[11px] text-fg-faint">0 active (logged out)</span>;
  }
  const seen = row.last_seen_at ?? null;
  const idleMinutes = seen === null ? 0 : Math.floor((now - new Date(seen).getTime()) / 60_000);
  const idle = idleAfterMinutes !== null && seen !== null && idleMinutes >= idleAfterMinutes;
  return (
    <div className="flex flex-col">
      {idle ? (
        <span className="font-body-code text-body-code text-warn" title={formatMoment(seen)}>
          {`Idle (${formatAgo(seen, now).replace(' ago', '')})`}
        </span>
      ) : (
        <span className="font-body-code text-body-code text-good">
          {`${count} ${count === 1 ? 'session' : 'sessions'}`}
        </span>
      )}
      {row.last_session_ip != null && (
        <span className="font-body-code text-[11px] text-fg-faint">{row.last_session_ip}</span>
      )}
    </div>
  );
}

// Density follows the mockup (M7): roomy identity cell, compact mono cells after it.
const HEAD = 'px-3 py-2';
const HEAD_FIRST = 'min-w-0 px-4 py-2.5';
const HEAD_END = 'px-3 py-2 text-right';
const CELL = 'px-3 py-2.5 whitespace-nowrap';
const CELL_FIRST = 'px-4 py-3 whitespace-nowrap';
const CELL_END = 'px-3 py-2.5 whitespace-nowrap text-right';
const CHECK =
  'h-3.5 w-3.5 cursor-pointer rounded-sm border-border-strong bg-surface accent-primary';

export function UserTable({
  users,
  selectedId,
  meId,
  checked,
  canWrite,
  idleAfterMinutes,
  onToggle,
  onToggleAll,
  onSelect,
  onEdit,
}: {
  users: readonly UserRow[];
  selectedId: string | null;
  /** The signed in account: its delete and lock are disabled. */
  meId: string | null;
  /** Rows ticked for the bulk actions. */
  checked: ReadonlySet<string>;
  /** Superadmin: every write is theirs. Hiding the buttons for others is a convenience. */
  canWrite: boolean;
  idleAfterMinutes: number | null;
  onToggle: (id: string) => void;
  onToggleAll: (all: boolean) => void;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
}): ReactElement {
  // Read once per mount: the idle state is a snapshot, refreshed with the list.
  const [now] = useState(() => Date.now());
  if (users.length === 0) {
    return (
      <p className="py-space-xl text-center text-body-default text-fg-muted">No accounts match.</p>
    );
  }
  const allChecked = users.every((row) => checked.has(row.id));

  return (
    // Focusable so a keyboard user can scroll the table sideways on a narrow screen.
    <div className="w-full overflow-x-auto" tabIndex={0}>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="h-8 border-b border-border bg-surface-2 font-label-caps text-label-caps uppercase text-fg-muted">
            <th scope="col" className="w-9 px-3 text-center">
              <input
                type="checkbox"
                aria-label="Select every account on this page"
                checked={allChecked}
                onChange={(event) => onToggleAll(event.target.checked)}
                className={CHECK}
              />
            </th>
            <th scope="col" className={HEAD_FIRST}>
              User Identity
            </th>
            <th scope="col" className={HEAD}>
              Role
            </th>
            <th scope="col" className={HEAD}>
              Active Sessions
            </th>
            <th scope="col" className={HEAD}>
              Last Login
            </th>
            <th scope="col" className={HEAD_END}>
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border text-body-default">
          {users.map((row) => {
            const selected = row.id === selectedId;
            const role = ROLE[row.role];
            const isSelf = row.id === meId;
            return (
              <tr
                key={row.id}
                onClick={() => onSelect(row.id)}
                aria-current={selected ? 'true' : undefined}
                className={
                  'group cursor-pointer text-fg transition-colors hover:bg-surface-3 ' +
                  (selected ? 'bg-accent-soft' : '')
                }
              >
                <td className="px-3 py-2.5 text-center">
                  <input
                    type="checkbox"
                    aria-label={`Select ${row.username}`}
                    checked={checked.has(row.id)}
                    onClick={(event) => event.stopPropagation()}
                    onChange={() => onToggle(row.id)}
                    className={CHECK}
                  />
                </td>
                <td className={CELL_FIRST}>
                  <div className="flex items-center gap-3">
                    <div
                      className={`relative flex h-9 w-9 items-center justify-center rounded-sm font-body-code-bold text-body-code-bold ${isSelf ? 'border border-accent-soft-bd bg-accent-soft text-primary' : 'border border-border bg-surface-2 text-fg-muted'}`}
                    >
                      {initials(row)}
                      <span
                        aria-hidden="true"
                        className={
                          'absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-2 border-surface ' +
                          (row.is_locked ? 'bg-crit' : 'bg-good')
                        }
                      />
                    </div>
                    <div className="flex min-w-0 flex-col">
                      <span className="flex items-center gap-1.5 font-body-code-bold text-body-code-bold text-fg">
                        {row.username}
                        {isSelf && (
                          <span className="rounded-sm border border-border bg-surface-2 px-1.5 font-body-code text-[9px] text-fg-muted">
                            YOU
                          </span>
                        )}
                        {row.is_locked && (
                          <span className="rounded-sm border border-crit-bd bg-crit-soft px-1.5 text-caption text-crit">
                            Locked
                          </span>
                        )}
                      </span>
                      {/* N35: no email column; the second line is the display name. */}
                      <span className="font-caption text-caption text-fg-muted">
                        {row.display_name}
                      </span>
                    </div>
                  </div>
                </td>
                <td className={CELL}>
                  <span
                    className={`inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 font-body-code text-[11px] font-semibold ${role.tone}`}
                  >
                    <span aria-hidden="true" className="material-symbols-outlined text-[13px]">
                      {role.icon}
                    </span>
                    {role.label}
                  </span>
                </td>
                <td className={CELL}>
                  <SessionCell row={row} idleAfterMinutes={idleAfterMinutes} now={now} />
                </td>
                <td className={CELL}>
                  {row.last_login_at === null ? (
                    <span className="font-body-code text-[11px] text-fg-muted">
                      Never signed in
                    </span>
                  ) : (
                    <span
                      className="font-body-code text-[11px] text-fg"
                      title={formatMoment(row.last_login_at)}
                    >
                      {formatMoment(row.last_login_at)}
                    </span>
                  )}
                </td>
                <td className={CELL_END}>
                  {canWrite && (
                    <div className="flex items-center justify-end gap-1 opacity-80 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        title="Edit Role"
                        aria-label={`Edit ${row.username}`}
                        onClick={(event) => {
                          // Edit selects the account itself; the row's own click would close the form.
                          event.stopPropagation();
                          onEdit(row.id);
                        }}
                        className={
                          ICON_BUTTON +
                          ' text-fg-muted hover:bg-surface-2 hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring'
                        }
                      >
                        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                          edit
                        </span>
                      </button>
                      <UserActions user={row} isSelf={isSelf} />
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
