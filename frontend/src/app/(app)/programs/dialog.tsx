'use client';

import { type ReactElement, type ReactNode, useEffect, useId, useRef } from 'react';

import { DANGER_BUTTON, SECONDARY_BUTTON } from './ui';

const FOCUSABLE =
  'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), ' +
  'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/** A modal frame like the Run Scan dialog: focus moves in, Tab stays in, Escape closes,
 * and focus returns to the opener. */
export function Dialog({
  title,
  onClose,
  busy = false,
  children,
}: {
  title: string;
  onClose: () => void;
  busy?: boolean;
  children: ReactNode;
}): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const opener = document.activeElement;
    ref.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => {
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!busy) onClose();
        return;
      }
      if (event.key !== 'Tab' || ref.current === null) return;
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE));
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
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [busy, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-gutter backdrop-blur-scrim">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-surface-container p-margin text-fg shadow-modal"
      >
        <h2 id={titleId} className="font-panel-title text-panel-title text-fg">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

/** A yes or no question before an action that cannot be undone from this screen. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}): ReactElement {
  return (
    <Dialog title={title} onClose={onClose} busy={busy}>
      <div className="bg-surface-container">
        <p className="mt-space-sm text-body-default text-fg-muted">{message}</p>
        {error !== null && (
          <p role="alert" className="mt-space-sm text-body-default text-crit-strong">
            {error}
          </p>
        )}
        <div className="mt-gutter flex justify-end gap-space-sm">
          <button type="button" onClick={onClose} disabled={busy} className={SECONDARY_BUTTON}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} className={DANGER_BUTTON}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
