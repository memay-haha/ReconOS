'use client';

import { type FormEvent, type ReactElement, useEffect, useRef, useState } from 'react';

import { ApiError, fieldErrorsOf } from '@/lib/api-client';
import { JOB_PRIORITIES, JOB_PRIORITY_LABEL, type JobPriority } from '@/lib/jobs';
import type { ParamSchema, ParamSpec, ToolModule } from '@/lib/tool-modules';

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
  /** D8: the dispatcher hands out `high` first. */
  readonly priority: JobPriority;
  /** Values for the tool module's `param_schema` (D7-A); blank fields are left out so the
   * backend applies `default_params`. */
  readonly params: Readonly<Record<string, unknown>>;
}

/** A tool module as the dialog needs it: the list row of `GET /tool-modules` carries the
 * parameter allowlist. */
export type ScanToolModule = ToolModule & {
  readonly param_schema?: ParamSchema;
  readonly accepts_wildcard?: boolean;
};

function isNumeric(spec: ParamSpec): boolean {
  return spec.type === 'integer' || spec.type === 'number';
}

function initialParams(module: ScanToolModule | undefined): Record<string, string | boolean> {
  const values: Record<string, string | boolean> = {};
  for (const [key, spec] of Object.entries(module?.param_schema?.properties ?? {})) {
    const value = module?.default_params[key] ?? spec.default;
    values[key] =
      spec.type === 'boolean'
        ? value === true
        : value === undefined || value === null
          ? ''
          : String(value);
  }
  return values;
}

function paramsOf(
  module: ScanToolModule | undefined,
  values: Readonly<Record<string, string | boolean>>,
): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(module?.param_schema?.properties ?? {})) {
    const value = values[key];
    if (typeof value === 'boolean') params[key] = value;
    else if (value === undefined || value.trim() === '') continue;
    else params[key] = isNumeric(spec) ? Number(value) : value;
  }
  return params;
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
  // Wildcard targets (radar Run Scan) start on a tool module that takes them;
  // the backend still decides: docs/architecture/business-flow.md.
  const first =
    (targets.some((t) => t.startsWith('*.'))
      ? enabled.find((m) => m.accepts_wildcard === true)
      : undefined) ?? enabled[0];
  const [toolModuleId, setToolModuleId] = useState(first?.id ?? '');
  const [targetText, setTargetText] = useState(targets.join('\n'));
  const [priority, setPriority] = useState<JobPriority>('normal');
  const [paramValues, setParamValues] = useState(() => initialParams(first));
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
    onSubmit({ toolModuleId, target, priority, params: paramsOf(chosen, paramValues) });
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
              onChange={(e) => {
                setToolModuleId(e.target.value);
                setParamValues(initialParams(enabled.find((m) => m.id === e.target.value)));
              }}
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
          <div className="flex flex-col gap-space-sm">
            <label htmlFor="run-scan-priority" className={LABEL}>
              Priority
            </label>
            <select
              id="run-scan-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as JobPriority)}
              className={FIELD}
            >
              {JOB_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {JOB_PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
            <FieldError errors={fields} field="priority" />
          </div>
          {Object.keys(chosen?.param_schema?.properties ?? {}).length > 0 && (
            <fieldset className="flex flex-col gap-space-sm">
              <legend className={LABEL}>Parameters</legend>
              {Object.entries(chosen?.param_schema?.properties ?? {}).map(([key, spec]) => {
                const id = `run-scan-param-${key}`;
                const value = paramValues[key];
                return (
                  <div key={key} className="flex flex-col gap-space-xs">
                    {spec.type === 'boolean' ? (
                      <label
                        htmlFor={id}
                        className="flex items-center gap-space-sm text-body-default text-fg"
                      >
                        <input
                          id={id}
                          type="checkbox"
                          checked={value === true}
                          onChange={(e) =>
                            setParamValues((v) => ({ ...v, [key]: e.target.checked }))
                          }
                          className="h-4 w-4 accent-primary-container"
                        />
                        {spec.title ?? key}
                      </label>
                    ) : (
                      <>
                        <label htmlFor={id} className="text-caption text-fg-muted">
                          {spec.title ?? key}
                        </label>
                        <input
                          id={id}
                          type={isNumeric(spec) ? 'number' : 'text'}
                          min={spec.minimum}
                          max={spec.maximum}
                          value={typeof value === 'string' ? value : ''}
                          onChange={(e) => setParamValues((v) => ({ ...v, [key]: e.target.value }))}
                          className={FIELD}
                        />
                      </>
                    )}
                    {spec.description === undefined ? null : (
                      <p className="text-caption text-fg-faint">{spec.description}</p>
                    )}
                    <FieldError errors={fields} field={`params.${key}`} />
                  </div>
                );
              })}
            </fieldset>
          )}
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
  readonly toolModules: readonly ScanToolModule[];
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
