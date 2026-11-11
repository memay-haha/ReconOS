'use client';

import Link from 'next/link';
import { useState } from 'react';

import type { Alert, AlertType } from '@/lib/alerts';
import { alertHref } from '@/lib/alerts';
import { formatMoment } from '@/lib/format-moment';

const TYPE: Record<AlertType, { icon: string; label: string; tone: string }> = {
  finding_new: { icon: 'pest_control', label: 'New finding', tone: 'text-crit' },
  job_pending_approval: {
    icon: 'pending_actions',
    label: 'Job pending approval',
    tone: 'text-warn',
  },
  job_failed: { icon: 'error', label: 'Job failed', tone: 'text-crit' },
  asset_new: { icon: 'add_circle', label: 'New asset', tone: 'text-good' },
  cert_expiring: { icon: 'lock_clock', label: 'TLS certificate expiring', tone: 'text-warn' },
};

const ICON_BUTTON =
  'relative flex rounded-sm p-1.5 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg';

/** The topbar bell (s02-dashboard.html): an unread dot, and a panel of the newest alerts of
 * GET /alerts with mark-read actions (decision C4). Props only: the shell calls the API. */
export function AlertBell({
  unread,
  alerts,
  loading,
  failed,
  onOpen,
  onMarkRead,
  onMarkAllRead,
  markFailed,
}: {
  /** Unread alerts of the account; null while unknown. */
  unread: number | null;
  alerts: readonly Alert[] | null;
  loading: boolean;
  failed: boolean;
  /** Called when the panel opens, so the list is read only when wanted. */
  onOpen: () => void;
  onMarkRead: (alertId: string) => void;
  onMarkAllRead: () => void;
  markFailed: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hasUnread = unread !== null && unread > 0;
  const name = hasUnread ? `Alerts, ${unread} unread` : 'Alerts';

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false);
      }}
    >
      <button
        type="button"
        aria-label={name}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          if (!open) onOpen();
          setOpen(!open);
        }}
        className={ICON_BUTTON}
      >
        <span aria-hidden="true" className="material-symbols-outlined text-icon">
          notifications
        </span>
        {hasUnread ? (
          <span
            aria-hidden="true"
            className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-crit ring-2 ring-surface"
          />
        ) : null}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Alerts"
          className="absolute top-full right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-surface shadow-modal"
        >
          <div className="flex items-center justify-between border-b border-border px-space-md py-2">
            <span className="font-panel-title text-caption font-semibold text-fg">Alerts</span>
            <button
              type="button"
              onClick={onMarkAllRead}
              disabled={!hasUnread}
              className="font-body-code text-caption text-primary hover:underline disabled:cursor-not-allowed disabled:text-fg-faint disabled:no-underline"
            >
              Mark all read
            </button>
          </div>
          {markFailed ? (
            <p role="alert" className="px-space-md pt-2 text-caption text-error">
              Could not mark alerts read. Try again later.
            </p>
          ) : null}
          {failed ? (
            <p role="alert" className="px-space-md py-3 text-caption text-error">
              Could not load alerts.
            </p>
          ) : alerts === null || loading ? (
            <p role="status" className="px-space-md py-3 text-caption text-fg-faint">
              Loading alerts…
            </p>
          ) : alerts.length === 0 ? (
            <p role="status" className="px-space-md py-3 text-caption text-fg-faint">
              No alerts.
            </p>
          ) : (
            <ul className="max-h-96 divide-y divide-border-subtle overflow-y-auto">
              {alerts.map((alert) => {
                const type = TYPE[alert.alert_type];
                const href = alertHref(alert);
                const body = (
                  <>
                    <span
                      aria-hidden="true"
                      className={`material-symbols-outlined text-icon ${type.tone}`}
                    >
                      {type.icon}
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-micro font-semibold tracking-wider text-fg-faint uppercase">
                        {type.label}
                      </span>
                      <span className="text-caption break-words text-fg">{alert.message}</span>
                      <span className="font-body-code text-micro text-fg-faint">
                        {formatMoment(alert.created_at)}
                      </span>
                    </span>
                  </>
                );
                return (
                  <li key={alert.id} className="flex items-start gap-2 px-space-md py-2">
                    {href === null ? (
                      <span className="flex min-w-0 flex-1 items-start gap-2">{body}</span>
                    ) : (
                      <Link
                        href={href}
                        onClick={() => setOpen(false)}
                        className="flex min-w-0 flex-1 items-start gap-2 hover:underline"
                      >
                        {body}
                      </Link>
                    )}
                    {alert.is_read ? null : (
                      <button
                        type="button"
                        aria-label={`Mark read: ${type.label}`}
                        onClick={() => onMarkRead(alert.id)}
                        className="flex shrink-0 rounded-sm p-1 text-fg-faint hover:bg-surface-2 hover:text-fg"
                      >
                        <span aria-hidden="true" className="material-symbols-outlined text-icon">
                          done
                        </span>
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
