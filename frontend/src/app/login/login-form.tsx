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
  'h-9 w-full rounded-sm bg-surface-2 pl-9 text-fg font-body-code text-body-code ' +
  'placeholder:text-fg-faint focus:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-ring';
const LABEL = 'font-label-caps text-label-caps uppercase tracking-wider text-fg-muted';
const FIELD_ICON =
  'material-symbols-outlined pointer-events-none absolute left-space-md text-icon text-fg-faint';

export function LoginForm() {
  const router = useRouter();
  const login = useLogin();
  const [username, setUsername] = useState('');
  const [revealed, setRevealed] = useState(false);
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
    <form method="post" onSubmit={onSubmit} className="flex flex-col">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="username" className={LABEL}>
            Username
          </label>
        </div>
        <div className="relative flex items-center">
          <span aria-hidden="true" className={FIELD_ICON}>
            terminal
          </span>
          <input
            id="username"
            name="username"
            autoComplete="username"
            placeholder="e.g. operator_01"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={`${FIELD} pr-space-md`}
          />
        </div>
      </div>
      <div className="mt-1 flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="password" className={LABEL}>
            Password
          </label>
        </div>
        <div className="relative flex items-center">
          <span aria-hidden="true" className={FIELD_ICON}>
            key
          </span>
          <input
            id="password"
            name="password"
            type={revealed ? 'text' : 'password'}
            autoComplete="current-password"
            required
            ref={passwordRef}
            className={`${FIELD} pr-10`}
          />
          <button
            type="button"
            aria-label="Show characters"
            aria-pressed={revealed}
            onClick={() => setRevealed((r) => !r)}
            className="absolute right-2.5 flex items-center justify-center p-1 text-fg-faint transition-colors hover:text-fg focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-icon">
              {revealed ? 'visibility_off' : 'visibility'}
            </span>
          </button>
        </div>
      </div>
      {message !== null && (
        <p
          role="alert"
          className="mt-space-md rounded-sm border border-crit-bd bg-crit-soft px-space-md py-space-sm font-body-default text-body-default text-crit"
        >
          {message}
        </p>
      )}
      <button
        type="submit"
        disabled={login.isPending}
        className="mt-2 flex h-10.5 w-full items-center justify-center gap-space-sm rounded-sm bg-primary-container font-body-code-bold text-body-default tracking-wide text-accent-ink shadow-lg shadow-primary-container/20 transition-colors hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
      >
        {login.isPending ? 'Signing in…' : 'Sign In'}
      </button>
    </form>
  );
}
