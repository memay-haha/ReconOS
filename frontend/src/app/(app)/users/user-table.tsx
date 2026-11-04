'use client';

import type { ReactElement } from 'react';

import { formatMoment } from '@/lib/format-moment';
import type { UserRow } from '@/lib/users';

const ROLE_LABEL: Record<UserRow['role'], string> = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  user: 'User',
};

function moment(value: string | null): string {
  return value === null ? 'Chưa đăng nhập' : formatMoment(value);
}

const HEAD = 'px-space-md py-space-sm text-label-caps text-fg-muted';
const CELL = 'px-space-md py-space-sm text-body-default';

export function UserTable({
  users,
  selectedId,
  onSelect,
}: {
  users: readonly UserRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}): ReactElement {
  if (users.length === 0) {
    return (
      <p className="py-space-xl text-center text-body-default text-fg-muted">
        Chưa có tài khoản nào.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className={HEAD}>
              Tên đăng nhập
            </th>
            <th scope="col" className={HEAD}>
              Tên hiển thị
            </th>
            <th scope="col" className={HEAD}>
              Vai trò
            </th>
            <th scope="col" className={HEAD}>
              Trạng thái
            </th>
            <th scope="col" className={HEAD}>
              Đăng nhập gần nhất
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((row) => {
            const selected = row.id === selectedId;
            return (
              <tr
                key={row.id}
                onClick={() => onSelect(row.id)}
                aria-current={selected ? 'true' : undefined}
                className={
                  'cursor-pointer border-b border-border text-fg hover:bg-surface-2 ' +
                  (selected ? 'bg-accent-soft' : '')
                }
              >
                <td className={CELL}>
                  {/* The click bubbles to the row; the button is the keyboard way in. */}
                  <button
                    type="button"
                    className="text-left text-body-code text-fg underline-offset-2 hover:underline"
                  >
                    {row.username}
                  </button>
                </td>
                <td className={CELL}>{row.display_name}</td>
                <td className={CELL}>{ROLE_LABEL[row.role]}</td>
                <td className={CELL}>
                  <span className={row.is_locked ? 'text-crit' : 'text-good'}>
                    {row.is_locked ? 'Đã khóa' : 'Hoạt động'}
                  </span>
                </td>
                <td className={CELL}>{moment(row.last_login_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
