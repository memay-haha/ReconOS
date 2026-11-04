'use client';

import type { ReactElement } from 'react';

import { ApiError } from '@/lib/api-client';
import { type UserRow, useLockUser, useUnlockUser } from '@/lib/users';

function failureText(error: unknown): string {
  // Never the backend's English title. 409 and 403 are the backend refusing the change itself.
  if (error instanceof ApiError && (error.status === 409 || error.status === 403)) {
    return 'The server refused this action.';
  }
  return 'Could not change the account status.';
}

export function UserActions({ user, isSelf }: { user: UserRow; isSelf: boolean }): ReactElement {
  const lock = useLockUser();
  const unlock = useUnlockUser();
  const active = user.is_locked ? unlock : lock;

  return (
    <div className="flex flex-col gap-space-sm">
      {/* Hiding the button on your own row is a convenience. The backend
          refuses a Superadmin locking itself either way. */}
      {!(isSelf && !user.is_locked) && (
        <button
          type="button"
          onClick={() => active.mutate(user.id)}
          disabled={active.isPending}
          className="h-10 self-start rounded-sm border border-border px-space-xl text-body-default text-fg focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
        >
          {user.is_locked ? 'Unlock' : 'Lock'}
        </button>
      )}
      {active.error !== null && (
        <p
          role="alert"
          className="rounded-sm border border-crit-bd bg-crit-soft px-space-md py-space-sm text-body-default text-crit"
        >
          {failureText(active.error)}
        </p>
      )}
    </div>
  );
}
