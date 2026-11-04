'use client';

import { type FormEvent, type KeyboardEvent, type ReactElement, useEffect, useRef } from 'react';

import { ApiError, fieldErrorsOf } from '@/lib/api-client';
import { useChangePassword } from '@/lib/auth';

import { FieldError } from './field-error';

const LOCKED = 'Too many failed attempts. Try again later.';
const UNREACHABLE = 'Cannot reach the server. Check your connection and try again.';
const UNEXPECTED = 'Could not change the password. Try again later.';

const FOCUSABLE =
  'input:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
const FIELD =
  'h-10 w-full rounded-sm bg-surface-2 px-space-md text-fg font-body-code text-body-code ' +
  'focus:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-ring';
const LABEL = 'font-label-caps text-label-caps uppercase tracking-wider text-fg-muted';

/** A message for failures that belong to no field. Field codes are rendered by FieldError. */
function describeError(error: unknown, fields: Record<string, string>): string | null {
  if (error === null || error === undefined) return null;
  if (!(error instanceof ApiError)) return error instanceof TypeError ? UNREACHABLE : UNEXPECTED;
  if (error.status === 429) return LOCKED;
  // A 422 whose problems are all on a field is already shown beside that field.
  if (Object.keys(fields).length > 0) return null;
  return UNEXPECTED;
}

function Body({ onClose }: { onClose: () => void }): ReactElement {
  const change = useChangePassword();
  // Uncontrolled on purpose: React mirrors a controlled input's value into the DOM
  // `value` attribute, which would put the password into the markup.
  const currentRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus goes in on open and back to the opener on close.
  useEffect(() => {
    const opener = document.activeElement;
    currentRef.current?.focus();
    return () => {
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    change.mutate(
      {
        current_password: currentRef.current?.value ?? '',
        new_password: nextRef.current?.value ?? '',
      },
      {
        onSuccess: () => {
          if (currentRef.current !== null) currentRef.current.value = '';
          if (nextRef.current !== null) nextRef.current.value = '';
          onClose();
        },
      },
    );
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || dialogRef.current === null) return;
    const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = items[0];
    const last = items[items.length - 1];
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const fields = fieldErrorsOf(change.error);
  const message = describeError(change.error, fields);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-gutter backdrop-blur-xs">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
        onKeyDown={onKeyDown}
        className="max-h-full w-full max-w-md overflow-y-auto rounded-lg border border-border bg-surface-container p-margin shadow-modal"
      >
        <h2 id="change-password-title" className="font-panel-title text-panel-title text-fg">
          Change password
        </h2>
        {/* method="post" is the fallback when the handler never runs (submit before
            hydration, broken bundle): the default GET would put both passwords in the URL. */}
        <form method="post" onSubmit={onSubmit} className="mt-gutter flex flex-col gap-gutter">
          <div className="flex flex-col gap-space-sm">
            <label htmlFor="current-password" className={LABEL}>
              Current password
            </label>
            <input
              id="current-password"
              name="current_password"
              type="password"
              autoComplete="current-password"
              required
              ref={currentRef}
              className={FIELD}
            />
            <FieldError errors={fields} field="current_password" />
          </div>
          <div className="flex flex-col gap-space-sm">
            <label htmlFor="new-password" className={LABEL}>
              New password
            </label>
            <input
              id="new-password"
              name="new_password"
              type="password"
              autoComplete="new-password"
              required
              ref={nextRef}
              className={FIELD}
            />
            <FieldError errors={fields} field="new_password" />
          </div>
          {message !== null && (
            <p
              role="alert"
              className="rounded-sm border border-crit-bd bg-crit-soft px-space-md py-space-sm text-body-default text-crit"
            >
              {message}
            </p>
          )}
          <div className="flex justify-end gap-space-sm">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-sm border border-border px-space-md text-body-default text-fg-muted hover:text-fg focus:outline-none focus:ring-2 focus:ring-ring"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={change.isPending}
              className="h-10 rounded-sm bg-primary-container px-space-md font-body-code-bold text-body-default text-accent-ink hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            >
              {change.isPending ? 'Changing…' : 'Change password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ChangePasswordDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): ReactElement | null {
  return open ? <Body onClose={onClose} /> : null;
}
