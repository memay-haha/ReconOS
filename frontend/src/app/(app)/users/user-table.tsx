'use client';

import type { ReactElement } from 'react';

import { formatMoment } from '@/lib/format-moment';
import type { UserRow } from '@/lib/users';

import { ICON_BUTTON } from './icon-button';
import { UserActions } from './user-actions';

const ROLE: Record<UserRow['role'], { label: string; icon: string; tone: string }> = {
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

function moment(value: string | null): string {
  return value === null ? 'Never signed in' : formatMoment(value);
}

function initials(row: UserRow): string {
  return (
    row.display_name.trim().slice(0, 2).toUpperCase() || row.username.slice(0, 2).toUpperCase()
  );
}

function sessionText(count: number): string {
  if (count === 0) return 'No active sessions';
  return `${count} ${count === 1 ? 'session' : 'sessions'}`;
}

const HEAD = 'px-space-md py-space-sm';
const CELL = 'px-space-md py-space-sm whitespace-nowrap';

export function UserTable({
  users,
  selectedId,
  meId,
  onSelect,
  onEdit,
}: {
  users: readonly UserRow[];
  selectedId: string | null;
  /** The signed in account, whose lock button is disabled. */
  meId: string | null;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
}): ReactElement {
  if (users.length === 0) {
    return (
      <p className="py-space-xl text-center text-body-default text-fg-muted">No accounts yet.</p>
    );
  }

  return (
    // Focusable so a keyboard user can scroll the table sideways on a narrow screen.
    <div className="w-full overflow-x-auto" tabIndex={0}>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="h-8 border-b border-border bg-surface-2 text-label-caps uppercase text-fg-muted">
            <th scope="col" className={HEAD}>
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
            <th scope="col" className={HEAD + ' text-right'}>
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
                  'group cursor-pointer text-fg hover:bg-surface-3 ' +
                  (selected ? 'bg-accent-soft' : '')
                }
              >
                <td className={CELL}>
                  <div className="flex items-center gap-space-md">
                    <div className="relative flex h-9 w-9 items-center justify-center rounded-sm border border-accent-soft-bd bg-accent-soft text-body-code-bold text-primary">
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
                      <span className="flex items-center gap-space-sm text-body-code-bold text-fg">
                        {row.username}
                        {isSelf && (
                          <span className="rounded-sm border border-border bg-surface-2 px-space-xs text-caption text-fg-muted">
                            YOU
                          </span>
                        )}
                        {row.is_locked && (
                          <span className="rounded-sm border border-crit-bd bg-crit-soft px-space-xs text-caption text-crit">
                            Locked
                          </span>
                        )}
                      </span>
                      <span className="text-caption text-fg-muted">{row.display_name}</span>
                    </div>
                  </div>
                </td>
                <td className={CELL}>
                  <span
                    className={`inline-flex items-center gap-space-xs rounded-sm border px-space-sm text-body-code ${role.tone}`}
                  >
                    <span aria-hidden="true" className="material-symbols-outlined text-icon">
                      {role.icon}
                    </span>
                    {role.label}
                  </span>
                </td>
                <td className={CELL}>
                  <span
                    className={
                      'text-body-code ' +
                      (row.active_user_session_count > 0 ? 'text-good' : 'text-fg-muted')
                    }
                  >
                    {sessionText(row.active_user_session_count)}
                  </span>
                </td>
                <td className={CELL}>
                  <span className="text-body-code text-fg">{moment(row.last_login_at)}</span>
                </td>
                <td className={CELL + ' text-right'}>
                  <div className="flex flex-wrap items-center justify-end gap-space-xs">
                    <button
                      type="button"
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
                      <span aria-hidden="true" className="material-symbols-outlined text-icon">
                        edit
                      </span>
                    </button>
                    <UserActions user={row} isSelf={isSelf} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
