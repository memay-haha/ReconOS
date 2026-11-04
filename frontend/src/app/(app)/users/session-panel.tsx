'use client';

import type { ReactElement } from 'react';

import { ApiError } from '@/lib/api-client';
import { formatMoment } from '@/lib/format-moment';
import { useRevokeSession, useUserSessions } from '@/lib/sessions';

function revokeFailureText(error: unknown): string {
  // Never the backend's English title. The status picks the sentence; it is not a role check.
  if (error instanceof ApiError && error.status === 403) {
    return 'Only a Superadmin can revoke sessions.';
  }
  if (error instanceof ApiError && error.status === 404) {
    return 'This session has expired or was already revoked.';
  }
  return 'Could not revoke the session. Try again later.';
}

export function SessionPanel({ userId }: { userId: string }): ReactElement {
  const sessions = useUserSessions(userId);
  const revoke = useRevokeSession();

  if (sessions.isPending) {
    return <p className="text-body-default text-fg-muted">Loading sessions…</p>;
  }
  if (sessions.data === undefined) {
    return (
      <p
        role="alert"
        className="rounded-sm border border-crit-bd bg-crit-soft px-space-md py-space-sm text-body-default text-crit"
      >
        Could not load sessions.
      </p>
    );
  }
  const items = sessions.data.items;

  return (
    <div className="flex flex-col gap-space-sm">
      {/* A failed background refetch keeps the last good list and reports above it. */}
      {sessions.isError && (
        <p
          role="alert"
          className="rounded-sm border border-crit-bd bg-crit-soft px-space-md py-space-sm text-body-default text-crit"
        >
          Could not refresh the session list.
        </p>
      )}
      {items.length === 0 && <p className="text-body-default text-fg-muted">No active sessions.</p>}
      <ul className="flex flex-col gap-space-sm">
        {items.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-space-md rounded-sm border border-border p-space-md"
          >
            <span className="flex flex-col text-body-default text-fg">
              <span>{row.ip_address ?? 'Address unknown'}</span>
              <span className="text-caption text-fg-muted">
                Last active {formatMoment(row.last_seen_at)}
              </span>
            </span>
            <button
              type="button"
              onClick={() => revoke.mutate(row.id)}
              disabled={revoke.isPending}
              className="h-10 rounded-sm border border-border px-space-xl text-body-default text-fg focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            >
              Revoke
            </button>
          </li>
        ))}
      </ul>
      {revoke.isError && (
        <p
          role="alert"
          className="rounded-sm border border-crit-bd bg-crit-soft px-space-md py-space-sm text-body-default text-crit"
        >
          {revokeFailureText(revoke.error)}
        </p>
      )}
    </div>
  );
}
