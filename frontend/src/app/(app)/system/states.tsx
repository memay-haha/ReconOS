import type { ReactElement, ReactNode } from 'react';

import { ApiError } from '@/lib/api-client';

/** One sentence per outcome, written by the screen. The backend `title` is never shown. */
export function loadErrorText(error: unknown, what: string): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return `You do not have access to ${what}.`;
    // 404 also covers a resource in a program the account is not assigned to.
    if (error.status === 404) return `The ${what} does not exist.`;
  } else if (error instanceof TypeError) {
    return 'Cannot reach the server. Check your connection and try again.';
  }
  return `Could not load the ${what}.`;
}

export function saveErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return 'You do not have permission to change this.';
    if (error.status === 404) return 'This no longer exists. Reload the page.';
    if (error.status === 409) return 'Someone changed this at the same time. Reload and try again.';
  } else if (error instanceof TypeError) {
    return 'Cannot reach the server. Check your connection and try again.';
  }
  return 'Could not save the change. Try again later.';
}

/** The breadcrumb, title and description every part E screen opens with, as the mockups draw. */
export function PageHeader({
  section,
  current,
  title,
  description,
  children,
}: {
  section: string;
  current: string;
  title: string;
  description: string;
  children?: ReactNode;
}): ReactElement {
  return (
    <div className="flex flex-col justify-between gap-space-md pt-space-xs lg:flex-row lg:items-end">
      <div className="flex flex-col gap-space-xs">
        <div className="flex items-center gap-space-sm text-caption text-fg-faint">
          <span>ReconOS</span>
          <span aria-hidden="true">/</span>
          <span>{section}</span>
          <span aria-hidden="true">/</span>
          <span className="text-body-code text-primary">{current}</span>
        </div>
        <h1 className="text-headline-lg text-fg">{title}</h1>
        <p className="max-w-2xl text-body-default text-fg-muted">{description}</p>
      </div>
      {children}
    </div>
  );
}

/** Shown in place of a Superadmin-only screen. The backend still refuses the calls. */
export function NoAccess({ what }: { what: string }): ReactElement {
  return (
    <p
      role="alert"
      className="rounded-sm border border-border bg-surface px-space-md py-space-xl text-body-default text-fg-muted"
    >
      Only a Superadmin can open {what}.
    </p>
  );
}
