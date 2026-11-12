'use client';

import { type ReactElement, type ReactNode, useEffect, useRef, useState } from 'react';

import { useScreenshotHtml } from '@/lib/screenshots';

import { formatBytes } from './detail-panels';

const COUNT = new Intl.NumberFormat('en-US');
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';
const FOCUS = 'focus:outline-none focus:ring-2 focus:ring-ring';
const SECONDARY = `inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface-2 px-3 py-1.5 text-caption text-fg hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS}`;

/** A modal with a focus trap; Escape closes it unless `busy`. Focus returns to the opener. */
function Modal({
  labelledBy,
  busy = false,
  wide = false,
  onClose,
  children,
}: {
  labelledBy: string;
  busy?: boolean;
  wide?: boolean;
  onClose: () => void;
  children: ReactNode;
}): ReactElement {
  const ref = useRef<HTMLDivElement>(null);

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
        aria-labelledby={labelledBy}
        className={`flex max-h-full w-full flex-col overflow-hidden rounded-lg border border-border bg-surface-container shadow-modal ${
          wide ? 'max-w-4xl' : 'max-w-md'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

/** The page HTML as plain text inside `<pre>`: never parsed, never rendered (D1). */
export function HtmlSourceDialog({
  screenshotId,
  host,
  size,
  sha256,
  onClose,
}: {
  screenshotId: string;
  host: string;
  size: number | null;
  sha256: string | null;
  onClose: () => void;
}): ReactElement {
  const html = useScreenshotHtml(screenshotId, true);
  const [copied, setCopied] = useState(false);
  const lines = html.data === undefined ? null : html.data.split('\n').length;

  const copy = () => {
    if (html.data === undefined) return;
    void navigator.clipboard?.writeText(html.data).then(() => setCopied(true));
  };

  return (
    <Modal labelledBy="html-source-title" wide onClose={onClose}>
      <div className="flex items-center justify-between gap-2 border-b border-border bg-surface-2 px-space-lg py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-primary">
            code
          </span>
          <h3 id="html-source-title" className="truncate text-panel-title text-fg">
            Rendered HTML Source: {host}
          </h3>
          <span className="shrink-0 font-body-code text-caption text-fg-muted">
            {size === null ? '' : formatBytes(size)}
            {lines === null ? '' : ` (${COUNT.format(lines)} lines)`}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the HTML source"
          className={`flex rounded-sm p-1 text-fg-muted hover:bg-surface-3 hover:text-fg ${FOCUS}`}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
            close
          </span>
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-bg p-space-md">
        {html.isPending && <p className="text-body-default text-fg-muted">Loading the HTML…</p>}
        {html.isError && (
          <p role="alert" className="text-body-default text-crit">
            Could not load the page HTML.
          </p>
        )}
        {html.data !== undefined && (
          <pre className="whitespace-pre-wrap break-all font-body-code text-caption text-fg">
            {html.data}
          </pre>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface-2 px-space-lg py-3">
        <span className="min-w-0 truncate font-body-code text-caption text-fg-muted">
          SHA256: {sha256 ?? 'Unknown'}
        </span>
        <span className="flex gap-2">
          <button
            type="button"
            onClick={copy}
            disabled={html.data === undefined}
            className={SECONDARY}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[15px]">
              {copied ? 'check' : 'content_copy'}
            </span>
            {copied ? 'Copied' : 'Copy All'}
          </button>
          <button type="button" onClick={onClose} className={SECONDARY}>
            Close
          </button>
        </span>
      </div>
    </Modal>
  );
}

/** Confirms the soft delete (D5); the raw output stays. */
export function DeleteDialog({
  pending,
  failed,
  onConfirm,
  onClose,
}: {
  pending: boolean;
  failed: boolean;
  onConfirm: () => void;
  onClose: () => void;
}): ReactElement {
  return (
    <Modal labelledBy="delete-screenshot-title" busy={pending} onClose={onClose}>
      <div className="flex flex-col gap-space-md p-margin">
        <h2 id="delete-screenshot-title" className="text-panel-title text-fg">
          Delete this screenshot?
        </h2>
        <p className="text-body-default text-fg-muted">
          The screenshot leaves the gallery. Its raw output stays stored and can still be downloaded
          from the job.
        </p>
        {failed && (
          <p role="alert" className="text-body-default text-crit">
            Could not delete the screenshot.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={pending} className={SECONDARY}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={`inline-flex items-center gap-1.5 rounded-sm border border-crit-bd bg-crit-soft px-3 py-1.5 text-caption font-semibold text-crit hover:bg-crit/20 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS}`}
          >
            {pending ? 'Deleting…' : 'Delete Screenshot'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
