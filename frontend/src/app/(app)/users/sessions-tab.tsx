'use client';

import type { ReactElement } from 'react';

import { Pagination, useCursorStack } from '@/components/pagination';
import { ApiError } from '@/lib/api-client';
import { formatMoment } from '@/lib/format-moment';
import { useAllSessions, useRevokeSession } from '@/lib/sessions';

// The contract's default page size (openapi `limit`); the screen sends no limit.
const DEFAULT_LIMIT = 50;
const HEAD = 'px-3 py-2';
const CELL = 'px-3 py-2.5 whitespace-nowrap';

function revokeFailureText(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) {
    return 'This session has expired or was already revoked.';
  }
  return 'Could not revoke the session. Try again later.';
}

/** Every active session of every account, newest activity first. Superadmin only. */
export function SessionsTab(): ReactElement {
  const { cursor, canGoBack, depth, goNext, goBack } = useCursorStack();
  const sessions = useAllSessions(cursor);
  const revoke = useRevokeSession();

  return (
    <div className="w-full overflow-hidden rounded-sm border border-border bg-surface">
      {sessions.isPending && (
        <p className="px-space-md py-space-xl text-body-default text-fg-muted">Loading sessions…</p>
      )}
      {sessions.isError && (
        <p role="alert" className="px-space-md py-space-xl text-body-default text-crit">
          Could not load the session list.
        </p>
      )}
      {revoke.isError && (
        <p role="alert" className="px-space-md py-space-sm text-body-default text-crit">
          {revokeFailureText(revoke.error)}
        </p>
      )}
      {sessions.data !== undefined && (
        <>
          {sessions.data.items.length === 0 ? (
            <p className="py-space-xl text-center text-body-default text-fg-muted">
              No active sessions.
            </p>
          ) : (
            <div className="w-full overflow-x-auto" tabIndex={0}>
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="h-8 border-b border-border bg-surface-2 font-label-caps text-label-caps uppercase text-fg-muted">
                    <th scope="col" className="px-4 py-2.5">
                      Account
                    </th>
                    <th scope="col" className={HEAD}>
                      IP Address
                    </th>
                    <th scope="col" className={HEAD}>
                      User Agent
                    </th>
                    <th scope="col" className={HEAD}>
                      Last Seen
                    </th>
                    <th scope="col" className={HEAD}>
                      Expires
                    </th>
                    <th scope="col" className="px-3 py-2 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-body-default">
                  {sessions.data.items.map((row) => (
                    <tr key={row.id} className="text-fg transition-colors hover:bg-surface-3">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="font-body-code-bold text-body-code-bold text-fg">
                            {row.username ?? row.user_id}
                          </span>
                          {row.display_name !== undefined && (
                            <span className="font-caption text-caption text-fg-muted">
                              {row.display_name}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={CELL}>
                        <span className="font-body-code text-body-code text-fg">
                          {row.ip_address ?? 'Unknown'}
                        </span>
                      </td>
                      <td className="max-w-xs truncate px-3 py-2.5" title={row.user_agent ?? ''}>
                        <span className="font-body-code text-[11px] text-fg-muted">
                          {row.user_agent ?? 'Unknown'}
                        </span>
                      </td>
                      <td className={CELL}>
                        <span className="font-body-code text-[11px] text-fg">
                          {formatMoment(row.last_seen_at)}
                        </span>
                      </td>
                      <td className={CELL}>
                        <span className="font-body-code text-[11px] text-fg-muted">
                          {formatMoment(row.expires_at)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          title="Revoke"
                          aria-label={`Revoke session of ${row.username ?? row.user_id} from ${row.ip_address ?? 'an unknown address'}`}
                          onClick={() => revoke.mutate(row.id)}
                          disabled={revoke.isPending}
                          className="inline-flex items-center justify-center rounded-sm p-1 text-fg-muted hover:bg-surface-2 hover:text-crit focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                        >
                          <span
                            aria-hidden="true"
                            className="material-symbols-outlined text-[16px]"
                          >
                            link_off
                          </span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="border-t border-border bg-surface-2 px-3.5">
            <Pagination
              label="Session list pagination"
              page={{
                total: sessions.data.total,
                totalIsEstimate: sessions.data.total_is_estimate,
                nextCursor: sessions.data.next_cursor,
              }}
              shown={sessions.data.items.length}
              start={depth * DEFAULT_LIMIT + 1}
              noun="sessions"
              canGoBack={canGoBack}
              onBack={goBack}
              onNext={() => goNext(sessions.data.next_cursor)}
            />
          </div>
        </>
      )}
    </div>
  );
}
