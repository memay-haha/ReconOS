'use client';

import { type ReactElement, type ReactNode, useEffect, useRef } from 'react';

const FOCUSABLE =
  'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), ' +
  'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/** A modal dialog for the asset screens: focus moves in on open, Tab stays inside, Escape
 * closes unless an action is pending, and focus returns to the opener on close. */
export function Modal({
  titleId,
  pending,
  onClose,
  children,
}: {
  titleId: string;
  pending: boolean;
  onClose: () => void;
  children: ReactNode;
}): ReactElement {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement;
    dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => {
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!pending) onClose();
        return;
      }
      if (event.key !== 'Tab' || dialogRef.current === null) return;
      const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = items[0];
      const last = items[items.length - 1];
      if (first === undefined || last === undefined) return;
      const active = document.activeElement;
      const inside = active instanceof Node && dialogRef.current.contains(active);
      if (!inside) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, pending]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-gutter backdrop-blur-scrim">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-full w-full max-w-lg flex-col overflow-y-auto rounded-lg border border-border bg-surface-container shadow-modal"
      >
        {children}
      </div>
    </div>
  );
}

/** Asks before a destructive action. The action itself is the screen's mutation. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}): ReactElement {
  return (
    <Modal titleId="confirm-title" pending={pending} onClose={onClose}>
      <div className="flex flex-col gap-space-md p-margin">
        <h2 id="confirm-title" className="font-panel-title text-panel-title text-fg">
          {title}
        </h2>
        <p className="text-body-default text-fg-muted">{message}</p>
        {error !== null && (
          <p
            role="alert"
            className="rounded-sm border border-crit-bd bg-crit-soft px-space-md py-space-sm text-body-default text-crit"
          >
            {error}
          </p>
        )}
        <div className="flex justify-end gap-space-sm">
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="h-9 rounded-sm border border-border px-space-md text-body-default text-fg-muted hover:text-fg focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className="h-9 rounded-sm border border-crit-bd bg-crit-soft px-space-md text-body-default font-medium text-crit hover:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
          >
            {pending ? 'Deleting…' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
