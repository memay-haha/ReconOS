'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { ApiError } from '@/lib/api-client';
import { useLogin } from '@/lib/auth';

/** Every rejected sign in gets the same sentence: the backend answers the same
 * 401 for a wrong username, a wrong password and a locked account, and the
 * screen must not add a distinction the API deliberately removed. */
const REJECTED = 'Tên đăng nhập hoặc mật khẩu không đúng.';
const UNREACHABLE = 'Không kết nối được máy chủ. Kiểm tra kết nối rồi thử lại.';
const UNEXPECTED = 'Không đăng nhập được. Thử lại sau.';

function lockoutMessage(seconds: number | undefined): string {
  if (seconds === undefined) return 'Tài khoản tạm thời bị chặn do thử sai quá nhiều lần.';
  return `Tài khoản tạm thời bị chặn do thử sai quá nhiều lần. Thử lại sau ${Math.ceil(seconds / 60)} phút.`;
}

/** Reports what the backend said; it does not decide why a sign in failed. */
function describeError(error: unknown): string | null {
  if (error === null || error === undefined) return null;
  if (!(error instanceof ApiError)) return UNREACHABLE;
  if (error.status === 429) return lockoutMessage(error.retryAfterSeconds);
  if (error.status === 401) return REJECTED;
  return UNEXPECTED;
}

const FIELD =
  'h-10 w-full rounded-sm bg-surface-2 px-space-md text-fg font-body-default text-body-default ' +
  'border border-border focus:outline-none focus:ring-2 focus:ring-ring';

export function LoginForm() {
  const router = useRouter();
  const login = useLogin();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate(
      { username, password },
      {
        onSuccess: () => {
          setPassword('');
          router.push('/users');
        },
      },
    );
  };

  const message = describeError(login.error);

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-space-xl">
      <div className="flex flex-col gap-space-xs">
        <label
          htmlFor="username"
          className="font-label-caps text-label-caps uppercase text-fg-muted"
        >
          Tên đăng nhập
        </label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className={FIELD}
        />
      </div>
      <div className="flex flex-col gap-space-xs">
        <label
          htmlFor="password"
          className="font-label-caps text-label-caps uppercase text-fg-muted"
        >
          Mật khẩu
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={FIELD}
        />
      </div>
      {message !== null && (
        <p
          role="alert"
          className="rounded-sm border border-crit-bd bg-crit-soft px-space-md py-space-sm font-body-default text-body-default text-crit"
        >
          {message}
        </p>
      )}
      <button
        type="submit"
        disabled={login.isPending}
        className="h-10 rounded-sm bg-primary px-space-xl font-panel-title text-panel-title text-on-primary focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
      >
        {login.isPending ? 'Đang đăng nhập…' : 'Đăng nhập'}
      </button>
    </form>
  );
}
