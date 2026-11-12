'use client';

import { type ReactElement, type ReactNode, useEffect, useId, useRef } from 'react';

const FOCUSABLE =
  'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), ' +
  'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/** A modal dialog for the part E screens: focus moves in, Tab stays inside, Escape closes
 * unless a request is in flight, and focus returns to the opener. */
export function Modal({
  title,
  icon,
  busy,
  wide = false,
  onClose,
  children,
}: {
  title: string;
  /** Material Symbols ligature drawn before the title, as some mockup dialogs do. */
  icon?: string;
  busy: boolean;
  /** The diagnostics console of S15 is drawn wider than a form. */
  wide?: boolean;
  onClose: () => void;
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
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
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
        className={`max-h-full w-full overflow-y-auto rounded-lg border border-border bg-surface-container p-margin shadow-modal ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
      >
        {/* The icon sits beside the heading, so the dialog's name stays the title alone. */}
        <div className="flex items-center gap-space-sm">
          {icon === undefined ? null : (
            <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-primary">
              {icon}
            </span>
          )}
          <h2 id={titleId} className="text-panel-title text-fg">
            {title}
          </h2>
        </div>
        <div className="mt-gutter">{children}</div>
      </div>
    </div>
  );
}

export const BUTTON_SECONDARY =
  'h-9 rounded-sm border border-border-strong bg-surface px-space-md text-body-default text-fg hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60';
export const BUTTON_PRIMARY =
  'h-9 rounded-sm bg-primary-container px-space-md font-semibold text-body-default text-accent-ink hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60';
export const BUTTON_DANGER =
  'h-9 rounded-sm border border-crit-bd bg-crit-soft px-space-md text-body-default text-crit hover:bg-crit-strong-soft focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60';
export const FIELD =
  'h-10 rounded-sm border border-border bg-surface-2 px-space-md text-body-default text-fg focus:outline-none focus:ring-2 focus:ring-ring';
export const LABEL = 'flex flex-col gap-space-xs text-body-default text-fg';
export const PANEL = 'w-full overflow-hidden rounded-sm border border-border bg-surface';
export const STATE_TEXT = 'px-space-md py-space-xl text-body-default text-fg-muted';
export const ALERT_TEXT = 'px-space-md py-space-xl text-body-default text-crit';
export const HEAD = 'px-space-md py-space-sm';
export const CELL = 'px-space-md py-space-sm whitespace-nowrap';
export const HEAD_ROW =
  'h-8 border-b border-border bg-surface-2 text-label-caps uppercase text-fg-muted';
export const ROW = 'border-b border-border text-body-default text-fg last:border-b-0';
