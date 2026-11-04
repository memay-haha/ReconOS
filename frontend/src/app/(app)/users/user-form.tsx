'use client';

import { type FormEvent, type ReactElement, useRef, useState } from 'react';

import { FieldError } from '@/components/field-error';
import { ApiError, fieldErrorsOf } from '@/lib/api-client';
import { type UserRow, useCreateUser, useUpdateUser } from '@/lib/users';

const ROLES: readonly { value: UserRow['role']; label: string }[] = [
  { value: 'superadmin', label: 'Superadmin' },
  { value: 'admin', label: 'Admin' },
  { value: 'user', label: 'User' },
];

const LABEL = 'text-label-caps uppercase text-fg-muted';
const FIELD =
  'h-10 w-full rounded-sm border border-border bg-surface-2 px-space-md text-body-default text-fg ' +
  'focus:outline-none focus:ring-2 focus:ring-ring';

function failureText(error: unknown): string {
  // A duplicate username is a flat 409 with no field member, so it cannot sit by the input.
  if (error instanceof ApiError && error.status === 409) {
    return 'Tên đăng nhập này đã có người dùng.';
  }
  return 'Không lưu được tài khoản. Thử lại sau.';
}

export function UserForm({
  mode,
  user,
  onDone,
}: {
  mode: 'create' | 'edit';
  user?: UserRow;
  onDone: () => void;
}): ReactElement {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [role, setRole] = useState<UserRow['role']>(user?.role ?? 'user');
  // Uncontrolled on purpose: React mirrors a controlled input's value into the
  // DOM `value` attribute, which would put the password into the markup.
  const passwordRef = useRef<HTMLInputElement>(null);

  const create = useCreateUser();
  // The hook needs an id even in create mode; it is never called there.
  const update = useUpdateUser(user?.id ?? '');
  const active = mode === 'create' ? create : update;
  const errors = fieldErrorsOf(active.error);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const done = {
      onSuccess: () => {
        if (passwordRef.current !== null) passwordRef.current.value = '';
        onDone();
      },
    };
    if (mode === 'create') {
      create.mutate(
        {
          username,
          display_name: displayName,
          password: passwordRef.current?.value ?? '',
          role,
        },
        done,
      );
    } else {
      update.mutate({ display_name: displayName, role }, done);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-space-md rounded-md border border-border p-space-md"
    >
      {mode === 'create' && (
        <div className="flex flex-col gap-space-xs">
          <label htmlFor="user-username" className={LABEL}>
            Tên đăng nhập
          </label>
          <input
            id="user-username"
            autoComplete="off"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={FIELD}
          />
          <FieldError errors={errors} field="username" />
        </div>
      )}

      <div className="flex flex-col gap-space-xs">
        <label htmlFor="user-display-name" className={LABEL}>
          Tên hiển thị
        </label>
        <input
          id="user-display-name"
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className={FIELD}
        />
        <FieldError errors={errors} field="display_name" />
      </div>

      {mode === 'create' && (
        <div className="flex flex-col gap-space-xs">
          <label htmlFor="user-password" className={LABEL}>
            Mật khẩu
          </label>
          <input
            id="user-password"
            type="password"
            autoComplete="new-password"
            required
            ref={passwordRef}
            className={FIELD}
          />
          <FieldError errors={errors} field="password" />
        </div>
      )}

      <div className="flex flex-col gap-space-xs">
        <label htmlFor="user-role" className={LABEL}>
          Vai trò
        </label>
        <select
          id="user-role"
          value={role}
          onChange={(e) => setRole(e.target.value as UserRow['role'])}
          className={FIELD}
        >
          {ROLES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <FieldError errors={errors} field="role" />
      </div>

      {active.error !== null && Object.keys(errors).length === 0 && (
        <p
          role="alert"
          className="rounded-sm border border-crit-bd bg-crit-soft px-space-md py-space-sm text-body-default text-crit"
        >
          {failureText(active.error)}
        </p>
      )}

      <div className="flex gap-space-sm">
        <button
          type="submit"
          disabled={active.isPending}
          className="h-10 rounded-sm bg-primary px-space-xl text-panel-title text-on-primary focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
        >
          Lưu
        </button>
        <button
          type="button"
          onClick={onDone}
          className="h-10 rounded-sm border border-border px-space-xl text-body-default text-fg focus:outline-none focus:ring-2 focus:ring-ring"
        >
          Hủy
        </button>
      </div>
    </form>
  );
}
