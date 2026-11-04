'use client';

import { type FormEvent, type ReactElement, useState } from 'react';

import { Pagination, useCursorStack } from '@/components/pagination';
import { useAuditLogs } from '@/lib/audit-logs';
import { formatMoment } from '@/lib/format-moment';

export function AuditPanel({ userId }: { userId: string | null }): ReactElement {
  const [draftAction, setDraftAction] = useState('');
  const [action, setAction] = useState<string | null>(null);
  const [seenUserId, setSeenUserId] = useState<string | null>(userId);
  const { cursor, canGoBack, goNext, goBack, reset } = useCursorStack();
  const logs = useAuditLogs({ userId, action }, cursor);

  // Render-phase on purpose: an effect would paint one frame of the new filter with the old cursor.
  // A new account means a new result set: the cursors collected so far point into the old one.
  if (seenUserId !== userId) {
    setSeenUserId(userId);
    reset();
  }

  const onFilter = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = draftAction.trim();
    setAction(trimmed === '' ? null : trimmed);
    reset();
  };

  const labelId = 'audit-action-filter';

  return (
    <section className="flex flex-col gap-space-md">
      <h2 className="text-panel-title text-fg">Nhật ký thao tác</h2>

      <form onSubmit={onFilter} className="flex flex-wrap items-end gap-space-sm">
        <label htmlFor={labelId} className="flex flex-col gap-space-xs text-body-default text-fg">
          Thao tác
          <input
            id={labelId}
            value={draftAction}
            onChange={(e) => setDraftAction(e.target.value)}
            className="h-10 rounded-sm border border-border bg-surface px-space-md text-body-default text-fg focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <button
          type="submit"
          className="h-10 rounded-sm border border-border px-space-xl text-body-default text-fg focus:outline-none focus:ring-2 focus:ring-ring"
        >
          Lọc
        </button>
      </form>

      {logs.isPending && <p className="text-body-default text-fg-muted">Đang tải nhật ký…</p>}
      {logs.data === undefined && logs.isError && (
        <p
          role="alert"
          className="rounded-sm border border-crit-bd bg-crit-soft px-space-md py-space-sm text-body-default text-crit"
        >
          Không tải được nhật ký thao tác.
        </p>
      )}
      {logs.data !== undefined && (
        <>
          {/* A failed background refetch keeps the last good page and reports above it. */}
          {logs.isError && (
            <p
              role="alert"
              className="rounded-sm border border-crit-bd bg-crit-soft px-space-md py-space-sm text-body-default text-crit"
            >
              Không tải được nhật ký thao tác.
            </p>
          )}
          {logs.data.items.length === 0 ? (
            <p className="text-body-default text-fg-muted">Không có dòng nhật ký nào.</p>
          ) : (
            <ul className="flex flex-col gap-space-sm">
              {logs.data.items.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-col gap-space-xs rounded-md border border-border p-space-md text-body-default text-fg"
                >
                  <span className="flex flex-wrap justify-between gap-space-md">
                    <span className="text-body-code">{row.action}</span>
                    <span className="text-fg-muted">{formatMoment(row.created_at)}</span>
                  </span>
                  <span className="text-fg-muted">
                    {row.resource_type ?? 'Không gắn tài nguyên'} ·{' '}
                    {row.ip_address ?? 'Không rõ địa chỉ'}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Pagination
            label="Phân trang nhật ký thao tác"
            page={{
              total: logs.data.total,
              totalIsEstimate: logs.data.total_is_estimate,
              nextCursor: logs.data.next_cursor,
            }}
            canGoBack={canGoBack}
            onBack={goBack}
            onNext={() => goNext(logs.data.next_cursor)}
          />
        </>
      )}
    </section>
  );
}
