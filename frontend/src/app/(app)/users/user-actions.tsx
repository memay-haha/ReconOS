'use client';

import type { ReactElement } from 'react';

import { ApiError } from '@/lib/api-client';
import { type UserRow, useLockUser, useUnlockUser } from '@/lib/users';

import { ICON_BUTTON } from './icon-button';

function failureText(error: unknown): string {
  // Never the backend's English title. 409 and 403 are the backend refusing the change itself.
  if (error instanceof ApiError && (error.status === 409 || error.status === 403)) {
    return 'The server refused this action.';
  }
  return 'Could not change the account status.';
}

/** The lock slot of a table row. Hiding the lock on your own row is a convenience:
 * the backend refuses a Superadmin locking itself either way. */
export function UserActions({ user, isSelf }: { user: UserRow; isSelf: boolean }): ReactElement {
  const lock = useLockUser();
  const unlock = useUnlockUser();
  const active = user.is_locked ? unlock : lock;

  return (
    <>
      {isSelf && !user.is_locked ? (
        <button
          type="button"
          disabled
          aria-label="You cannot lock your own account"
          className={ICON_BUTTON + ' cursor-not-allowed text-fg-faint'}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-icon">
            lock
          </span>
        </button>
      ) : (
        <button
          type="button"
          aria-label={`${user.is_locked ? 'Unlock' : 'Lock'} ${user.username}`}
          onClick={(event) => {
            // The row selects on click; locking an account must not also select it.
            event.stopPropagation();
            active.mutate(user.id);
          }}
          disabled={active.isPending}
          className={
            ICON_BUTTON +
            ' text-fg-muted hover:bg-surface-2 hover:text-warn focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60'
          }
        >
          <span aria-hidden="true" className="material-symbols-outlined text-icon">
            {user.is_locked ? 'lock_open' : 'lock'}
          </span>
        </button>
      )}
      {active.error !== null && (
        <p role="alert" className="basis-full text-caption text-crit">
          {failureText(active.error)}
        </p>
      )}
    </>
  );
}
