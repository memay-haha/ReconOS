'use client';

import { type FormEvent, type ReactElement, useEffect, useRef, useState } from 'react';

import { ApiError, fieldErrorsOf } from '@/lib/api-client';
import type { ToolModule } from '@/lib/tool-modules';

import { FieldError } from './field-error';

const FOCUSABLE =
  'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), ' +
  'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
const FIELD =
  'h-10 w-full rounded-sm bg-surface-2 px-space-md text-fg font-body-code text-body-code ' +
  'focus:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-ring';
const LABEL = 'font-label-caps text-label-caps uppercase tracking-wider text-fg-muted';

const OUT_OF_SCOPE = 'A target is outside the program scope, or matches an Out-of-Scope rule.';
const UNREACHABLE = 'Cannot reach the server. Check your connection and try again.';
const UNEXPECTED = 'Could not create the job. Try again later.';

export interface RunScanRequest {
  readonly toolModuleId: string;
  readonly target: readonly string[];
}

/** The backend decides scope and approval; this only names the outcome it reported. */
function describeError(error: unknown): string | null {
  if (error === null || error === undefined) return null;
  if (!(error instanceof ApiError)) return error instanceof TypeError ? UNREACHABLE : UNEXPECTED;
  if (error.code === 'target_out_of_scope') return OUT_OF_SCOPE;
  if (Object.keys(error.fieldErrors).length > 0) return null;
  return UNEXPECTED;
}

function Body({
  programName,
  targets,
  editableTargets,
  toolModules,
  pending,
  error,
  onSubmit,
  onClose,
}: Omit<RunScanDialogProps, 'open'>): ReactElement {
  const enabled = toolModules.filter((m) => m.is_enabled);
  const [toolModuleId, setToolModuleId] = useState(enabled[0]?.id ?? '');
  const [targetText, setTargetText] = useState(targets.join('\n'));
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    const opener = document.activeElement;
    firstRef.current?.focus();
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

  const chosen = enabled.find((m) => m.id === toolModuleId);
  const fields = fieldErrorsOf(error);
  const message = describeError(error);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const target = targetText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');
    onSubmit({ toolModuleId, target });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-gutter backdrop-blur-scrim">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="run-scan-title"
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-surface-container p-margin shadow-modal"
      >
        <h2 id="run-scan-title" className="font-panel-title text-panel-title text-fg">
          Run Scan
        </h2>
        <p className="mt-space-xs text-body-default text-fg-muted">Program: {programName}</p>
        <form onSubmit={submit} className="mt-gutter flex flex-col gap-gutter">
          <div className="flex flex-col gap-space-sm">
            <label htmlFor="run-scan-tool-module" className={LABEL}>
              Tool module
            </label>
            <select
              id="run-scan-tool-module"
              ref={firstRef}
              value={toolModuleId}
              onChange={(e) => setToolModuleId(e.target.value)}
              className={FIELD}
            >
              {enabled.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <FieldError errors={fields} field="tool_module_id" />
            {chosen?.group === 'exploit' && (
              <p className="text-body-default text-warn">
                Requires approval: an Admin who did not create the job must approve it.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-space-sm">
            <label htmlFor="run-scan-target" className={LABEL}>
              Targets, one per line
            </label>
            <textarea
              id="run-scan-target"
              value={targetText}
              readOnly={!editableTargets}
              onChange={(e) => setTargetText(e.target.value)}
              rows={4}
              className="w-full rounded-sm bg-surface-2 px-space-md py-space-sm font-body-code text-body-code text-fg focus:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <FieldError errors={fields} field="target" />
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
              disabled={pending}
              onClick={onClose}
              className="h-10 rounded-sm border border-border px-space-md text-body-default text-fg-muted hover:text-fg focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending || toolModuleId === ''}
              className="h-10 rounded-sm bg-primary-container px-space-md font-body-code-bold text-body-default text-accent-ink hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            >
              {pending ? 'Creating…' : 'Create job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export interface RunScanDialogProps {
  readonly open: boolean;
  readonly programName: string;
  /** Prefilled targets: the selected assets, or empty for free entry. */
  readonly targets: readonly string[];
  readonly editableTargets: boolean;
  readonly toolModules: readonly ToolModule[];
  readonly pending: boolean;
  readonly error: unknown;
  readonly onSubmit: (request: RunScanRequest) => void;
  readonly onClose: () => void;
}

/** Creates one job with one tool module. Takes data through props only; the screen owns
 * `useCreateJob` and `useToolModules`. */
export function RunScanDialog({ open, ...rest }: RunScanDialogProps): ReactElement | null {
  return open ? <Body {...rest} /> : null;
}
