'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';

import { Pagination, useCursorStack } from '@/components/pagination';
import { useActiveSessionCount } from '@/lib/sessions';
import { useUsers } from '@/lib/users';

import { StatCards } from './stat-cards';
import { UserTable } from './user-table';

export default function UsersPage(): ReactElement {
  const { cursor, canGoBack, goNext, goBack } = useCursorStack();
  const users = useUsers(cursor);
  const sessionCount = useActiveSessionCount();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Later panels hang off the selected row.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const selectedUser = users.data?.items.find((row) => row.id === selectedId) ?? null;

  const cardsSettled = !users.isPending && !sessionCount.isPending;

  return (
    <div className="flex flex-col gap-space-xl">
      <h1 className="text-headline-lg text-fg">Tài khoản và phân quyền</h1>

      {cardsSettled ? (
        <StatCards userTotal={users.data?.total ?? null} sessionTotal={sessionCount.data ?? null} />
      ) : (
        <p className="text-body-default text-fg-muted">Đang tải số liệu…</p>
      )}

      {users.isPending && (
        <p className="text-body-default text-fg-muted">Đang tải danh sách tài khoản…</p>
      )}
      {users.isError && (
        <p
          role="alert"
          className="rounded-md bg-crit-soft px-space-md py-space-sm text-body-default text-crit"
        >
          Không tải được danh sách tài khoản.
        </p>
      )}
      {users.data !== undefined && (
        <>
          <UserTable users={users.data.items} selectedId={selectedId} onSelect={setSelectedId} />
          <Pagination
            page={{
              total: users.data.total,
              totalIsEstimate: users.data.total_is_estimate,
              nextCursor: users.data.next_cursor,
            }}
            canGoBack={canGoBack}
            onBack={goBack}
            onNext={() => goNext(users.data.next_cursor)}
          />
        </>
      )}
    </div>
  );
}
