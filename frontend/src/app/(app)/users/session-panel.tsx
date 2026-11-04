'use client';

import type { ReactElement } from 'react';

import { useRevokeSession, useUserSessions } from '@/lib/sessions';

// Duplicate of the formatter in user-table.tsx (kept there untouched): same zone, same
// 24-hour clock, same dd/mm/yyyy HH:mm output.
const MOMENT = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Asia/Ho_Chi_Minh',
});

function moment(value: string): string {
  const part = Object.fromEntries(
    MOMENT.formatToParts(new Date(value)).map((p) => [p.type, p.value]),
  );
  return `${part.day}/${part.month}/${part.year} ${part.hour}:${part.minute}`;
}

export function SessionPanel({ userId }: { userId: string }): ReactElement {
  const sessions = useUserSessions(userId);
  const revoke = useRevokeSession();

  if (sessions.isPending) {
    return <p className="text-body-default text-fg-muted">Đang tải phiên đăng nhập…</p>;
  }
  if (sessions.isError) {
    return (
      <p
        role="alert"
        className="rounded-sm border border-crit-bd bg-crit-soft px-space-md py-space-sm text-body-default text-crit"
      >
        Không tải được phiên đăng nhập.
      </p>
    );
  }
  if (sessions.data.items.length === 0) {
    return <p className="text-body-default text-fg-muted">Không có phiên nào đang hoạt động.</p>;
  }

  return (
    <div className="flex flex-col gap-space-sm">
      <ul className="flex flex-col gap-space-sm">
        {sessions.data.items.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-space-md rounded-md border border-border p-space-md"
          >
            <span className="flex flex-col text-body-default text-fg">
              <span>{row.ip_address ?? 'Không rõ địa chỉ'}</span>
              <span className="text-caption text-fg-muted">
                Hoạt động gần nhất {moment(row.last_seen_at)}
              </span>
            </span>
            <button
              type="button"
              onClick={() => revoke.mutate(row.id)}
              disabled={revoke.isPending}
              className="h-10 rounded-sm border border-border px-space-xl text-body-default text-fg focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            >
              Thu hồi
            </button>
          </li>
        ))}
      </ul>
      {revoke.isError && (
        <p
          role="alert"
          className="rounded-sm border border-crit-bd bg-crit-soft px-space-md py-space-sm text-body-default text-crit"
        >
          Máy chủ từ chối thao tác này hoặc không thu hồi được phiên.
        </p>
      )}
    </div>
  );
}
