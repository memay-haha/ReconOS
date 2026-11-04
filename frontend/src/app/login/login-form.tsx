'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useRef, useState } from 'react';

import { ApiError } from '@/lib/api-client';
import { useLogin } from '@/lib/auth';

/** Every rejected sign in gets the same sentence: the backend answers the same
 * 401 for a wrong username, a wrong password and a locked account, and the
 * screen must not add a distinction the API deliberately removed. */
const REJECTED = 'Incorrect username or password.';
const UNREACHABLE = 'Cannot reach the server. Check your connection and try again.';
const UNEXPECTED = 'Could not sign in. Try again later.';

function lockoutMessage(seconds: number | undefined): string {
  if (seconds === undefined)
    return 'Too many failed attempts. This account is temporarily blocked.';
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `Too many failed attempts. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`;
}

/** Reports what the backend said; it does not decide why a sign in failed. */
function describeError(error: unknown): string | null {
  if (error === null || error === undefined) return null;
  // Only a failed fetch (a TypeError) means the server could not be reached.
  if (!(error instanceof ApiError)) return error instanceof TypeError ? UNREACHABLE : UNEXPECTED;
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
  // Uncontrolled on purpose: React mirrors a controlled input's value into the
  // DOM `value` attribute, which would put the password into the markup.
  const passwordRef = useRef<HTMLInputElement>(null);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate(
      { username, password: passwordRef.current?.value ?? '' },
      {
        onSuccess: () => {
          if (passwordRef.current !== null) passwordRef.current.value = '';
          router.push('/users');
        },
      },
    );
  };

  const message = describeError(login.error);

  return (
    // method="post" is the fallback when the handler never runs (submit before
    // hydration, broken bundle, no JavaScript): the default GET would put the
    // credentials in the URL, history, access logs and Referer.
    <form method="post" onSubmit={onSubmit} className="flex w-full flex-col gap-space-xl">
      <div className="flex flex-col gap-space-xs">
        <label
          htmlFor="username"
          className="font-label-caps text-label-caps uppercase text-fg-muted"
        >
          Username
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
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          ref={passwordRef}
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
        {login.isPending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
