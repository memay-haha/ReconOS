'use client';

import { type ReactElement, useState } from 'react';

import { ApiError } from '@/lib/api-client';
import {
  type UserRow,
  useDeleteUser,
  useLockUser,
  useRevokeUserSessions,
  useUnlockUser,
} from '@/lib/users';

import { ICON_BUTTON } from './icon-button';

function failureText(error: unknown): string {
  // Never the backend's English title. 409 and 403 are the backend refusing the change itself.
  if (error instanceof ApiError && (error.status === 409 || error.status === 403)) {
    return 'The server refused this action.';
  }
  return 'Could not change the account.';
}

const ACTION =
  ICON_BUTTON + ' text-fg-muted hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-ring';

function Icon({ name }: { name: string }): ReactElement {
  return (
    <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
      {name}
    </span>
  );
}

/** Row actions after Edit: Revoke Sessions, Delete (Protected on your own row, D5) and Lock
 * as a fourth icon (N38). Disabling them on your own row is a convenience: the backend
 * refuses a Superadmin deleting or locking itself either way. */
export function UserActions({ user, isSelf }: { user: UserRow; isSelf: boolean }): ReactElement {
  const lock = useLockUser();
  const unlock = useUnlockUser();
  const revoke = useRevokeUserSessions();
  const remove = useDeleteUser();
  const [confirming, setConfirming] = useState(false);
  const toggle = user.is_locked ? unlock : lock;
  const error = toggle.error ?? revoke.error ?? remove.error;
  // The row selects on click; an action must not also select it.
  const act = (run: () => void) => (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    run();
  };

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1 text-caption">
        <span className="text-crit">Delete {user.username}?</span>
        <button
          type="button"
          onClick={act(() => remove.mutate(user.id, { onSettled: () => setConfirming(false) }))}
          disabled={remove.isPending}
          className="rounded-sm border border-crit-bd bg-crit-soft px-1.5 py-0.5 text-crit focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
        >
          Confirm
        </button>
        <button
          type="button"
          onClick={act(() => setConfirming(false))}
          className="rounded-sm border border-border px-1.5 py-0.5 text-fg-muted focus:outline-none focus:ring-2 focus:ring-ring"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        title="Revoke Sessions"
        aria-label={`Revoke sessions of ${user.username}`}
        onClick={act(() => revoke.mutate(user.id))}
        disabled={revoke.isPending}
        className={ACTION + ' hover:text-warn disabled:opacity-60'}
      >
        <Icon name="link_off" />
      </button>
      {isSelf ? (
        <button
          type="button"
          title="Protected"
          disabled
          aria-label="You cannot delete your own account"
          className={ICON_BUTTON + ' cursor-not-allowed text-fg-faint'}
        >
          <Icon name="lock" />
        </button>
      ) : (
        <button
          type="button"
          title="Delete User"
          aria-label={`Delete ${user.username}`}
          onClick={act(() => setConfirming(true))}
          className={ACTION + ' hover:text-crit'}
        >
          <Icon name="delete" />
        </button>
      )}
      {isSelf && !user.is_locked ? (
        <button
          type="button"
          disabled
          aria-label="You cannot lock your own account"
          className={ICON_BUTTON + ' cursor-not-allowed text-fg-faint'}
        >
          <Icon name="no_encryption" />
        </button>
      ) : (
        <button
          type="button"
          title={user.is_locked ? 'Unlock' : 'Lock'}
          aria-label={`${user.is_locked ? 'Unlock' : 'Lock'} ${user.username}`}
          onClick={act(() => toggle.mutate(user.id))}
          disabled={toggle.isPending}
          className={ACTION + ' hover:text-warn disabled:opacity-60'}
        >
          <Icon name={user.is_locked ? 'lock_open' : 'lock_person'} />
        </button>
      )}
      {error !== null && (
        <p role="alert" className="basis-full text-caption text-crit">
          {failureText(error)}
        </p>
      )}
    </>
  );
}
