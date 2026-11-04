'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';

import { Pagination, useCursorStack } from '@/components/pagination';
import { useMe } from '@/lib/auth';
import { useActiveSessionCount } from '@/lib/sessions';
import { useUsers } from '@/lib/users';

import { StatCards } from './stat-cards';
import { UserActions } from './user-actions';
import { UserForm } from './user-form';
import { UserTable } from './user-table';

export default function UsersPage(): ReactElement {
  const { cursor, canGoBack, goNext, goBack } = useCursorStack();
  const users = useUsers(cursor);
  const sessionCount = useActiveSessionCount();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const me = useMe();
  const selectedUser = users.data?.items.find((row) => row.id === selectedId) ?? null;

  const cardsSettled = !users.isPending && !sessionCount.isPending;

  return (
    <div className="flex flex-col gap-space-xl">
      <div className="flex flex-wrap items-center justify-between gap-space-md">
        <h1 className="text-headline-lg text-fg">Tài khoản và phân quyền</h1>
        <button
          type="button"
          onClick={() => setFormMode('create')}
          className="h-10 rounded-sm bg-primary px-space-xl text-panel-title text-on-primary focus:outline-none focus:ring-2 focus:ring-ring"
        >
          Thêm tài khoản
        </button>
      </div>

      {formMode !== null && (
        <UserForm
          key={formMode === 'edit' ? `edit-${selectedUser?.id ?? ''}` : 'create'}
          mode={formMode}
          user={formMode === 'edit' ? (selectedUser ?? undefined) : undefined}
          onDone={() => setFormMode(null)}
        />
      )}

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
          {selectedUser !== null && (
            <section
              aria-label="Chi tiết tài khoản"
              className="flex flex-col gap-space-md rounded-md border border-border p-space-md"
            >
              <h2 className="text-panel-title text-fg">{selectedUser.display_name}</h2>
              <div className="flex flex-wrap items-start gap-space-sm">
                <button
                  type="button"
                  onClick={() => setFormMode('edit')}
                  className="h-10 rounded-sm border border-border px-space-xl text-body-default text-fg focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  Sửa
                </button>
                <UserActions
                  key={selectedUser.id}
                  user={selectedUser}
                  isSelf={selectedUser.id === me.data?.id}
                />
              </div>
            </section>
          )}
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
