'use client';

import { type FormEvent, type ReactElement, useState } from 'react';

import { FieldError } from '@/components/field-error';
import { ApiError, fieldErrorsOf } from '@/lib/api-client';
import {
  JOB_PRIORITIES,
  JOB_PRIORITY_LABEL,
  type JobPriority,
  useBulkCreateJobs,
} from '@/lib/jobs';
import { type ToolModuleRow, useToolModules } from '@/lib/tool-modules';

import { COUNT, PRIMARY_BUTTON, PRIMARY_ICON } from './asset-ui';
import { Modal } from './modal';
import { type ScanAsset, singleProgram } from './run-scan-button';

// The compact form sits in a selection bar, beside its small buttons.
const COMPACT_BUTTON =
  'inline-flex h-6 items-center gap-1 rounded-sm bg-primary-container px-2.5 text-xs font-semibold text-accent-ink hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60';
const LABEL = 'text-label-caps uppercase tracking-wider text-fg-muted';

const OUT_OF_SCOPE = 'A target is outside the program scope, or matches an Out-of-Scope rule.';
const UNREACHABLE = 'Cannot reach the server. Check your connection and try again.';
const UNEXPECTED = 'Could not create the jobs. Try again later.';

/** The backend decides scope and approval; this only names the outcome it reported. */
function describeError(error: unknown): string | null {
  if (error === null || error === undefined) return null;
  if (!(error instanceof ApiError)) return error instanceof TypeError ? UNREACHABLE : UNEXPECTED;
  if (error.code === 'target_out_of_scope') return OUT_OF_SCOPE;
  if (Object.keys(error.fieldErrors).length > 0) return null;
  return UNEXPECTED;
}

/** Minutes as the mockup prints them, from `estimated_seconds` (M13). */
function minutes(seconds: number): string {
  return `~${COUNT.format(Math.max(1, Math.round(seconds / 60)))} min`;
}

/** The selected jobs run side by side, so the wait is the longest estimate among them. */
function longest(modules: readonly ToolModuleRow[]): number | null {
  const known = modules
    .map((m) => m.estimated_seconds)
    .filter((s): s is number => typeof s === 'number');
  return known.length === 0 ? null : Math.max(...known);
}

function Body({
  programId,
  programName,
  targets,
  activeIps,
  modules,
  onDone,
  onClose,
}: {
  programId: string;
  programName: string;
  targets: readonly string[];
  activeIps: number | undefined;
  modules: readonly ToolModuleRow[];
  onDone: (count: number) => void;
  onClose: () => void;
}): ReactElement {
  const create = useBulkCreateJobs();
  const enabled = modules.filter((m) => m.is_enabled);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [priority, setPriority] = useState<JobPriority>('normal');
  const chosen = enabled.filter((m) => picked.has(m.id));
  const estimate = longest(chosen);
  const message = describeError(create.error);
  const fields = fieldErrorsOf(create.error);

  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (chosen.length === 0) return;
    create.mutate(
      {
        program_id: programId,
        target: targets,
        priority,
        items: chosen.map((m) => ({ tool_module_id: m.id })),
      },
      { onSuccess: () => onDone(chosen.length) },
    );
  };

  const first = targets[0] ?? '';
  return (
    <Modal titleId="scan-modal-title" pending={create.isPending} onClose={onClose}>
      <div className="flex items-center justify-between gap-space-sm border-b border-border bg-surface-2 px-space-lg py-space-md">
        <h2
          id="scan-modal-title"
          className="flex items-center gap-space-sm font-panel-title text-panel-title text-fg"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-primary">
            radar
          </span>
          Run Scan
        </h2>
        <button
          type="button"
          aria-label="Close"
          disabled={create.isPending}
          onClick={onClose}
          className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-fg-muted hover:bg-surface-3 hover:text-fg focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
            close
          </span>
        </button>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-space-md p-space-lg">
        <div className="flex flex-col gap-1.5">
          <span className={LABEL}>Target Scope</span>
          <div className="flex flex-wrap items-center justify-between gap-space-sm rounded-sm border border-border bg-surface px-space-md py-2">
            <span className="min-w-0 truncate font-body-code text-sm font-semibold text-fg">
              {targets.length > 1 ? `${first} +${COUNT.format(targets.length - 1)} more` : first}
            </span>
            <span className="flex items-center gap-space-sm">
              <span className="font-body-code text-caption text-fg-muted">{programName}</span>
              {activeIps !== undefined && (
                <span className="rounded-sm border border-good-bd bg-good-soft px-1.5 font-body-code text-[11px] text-good">
                  {`${COUNT.format(activeIps)} Active ${activeIps === 1 ? 'IP' : 'IPs'}`}
                </span>
              )}
            </span>
          </div>
        </div>
        <fieldset className="flex flex-col gap-1.5">
          <legend className={LABEL + ' mb-1.5'}>Tool modules to dispatch</legend>
          {enabled.length === 0 && (
            <p className="text-body-default text-fg-muted">No tool module is enabled.</p>
          )}
          {enabled.map((m) => (
            <label
              key={m.id}
              className={`flex cursor-pointer items-start gap-space-sm rounded-sm border p-space-sm ${picked.has(m.id) ? 'border-accent-soft-bd bg-accent-soft' : 'border-border bg-surface hover:bg-surface-2'}`}
            >
              <input
                type="checkbox"
                checked={picked.has(m.id)}
                onChange={() => toggle(m.id)}
                className="mt-0.5 h-4 w-4 cursor-pointer accent-primary-container"
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="text-sm font-medium text-fg">{m.title || m.name}</span>
                  <span className="flex items-center gap-1.5">
                    <span className="rounded-sm border border-border bg-surface-2 px-1.5 font-body-code text-[11px] text-fg-muted">
                      {m.name}
                    </span>
                    {typeof m.estimated_seconds === 'number' && (
                      <span className="font-body-code text-[11px] text-fg-faint">
                        {minutes(m.estimated_seconds)}
                      </span>
                    )}
                  </span>
                </span>
                {m.description && (
                  <span className="text-caption text-fg-muted">{m.description}</span>
                )}
              </span>
            </label>
          ))}
          <FieldError errors={fields} field="items" />
          {chosen.some((m) => m.group === 'exploit') && (
            <p className="text-body-default text-warn">
              Exploit jobs wait for approval by an Admin who did not create them.
            </p>
          )}
        </fieldset>
        <div className="flex flex-wrap items-center justify-between gap-space-sm rounded-sm border border-border bg-surface px-space-md py-2">
          <label className="flex items-center gap-space-sm">
            <span className={LABEL}>Priority</span>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as JobPriority)}
              className="h-7 rounded-sm border border-border bg-surface-2 px-2 font-body-code text-xs text-fg focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {JOB_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {JOB_PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          <span className="font-body-code text-caption text-fg-muted">
            {`Estimated: ${estimate === null ? 'n/a' : minutes(estimate)}`}
          </span>
        </div>
        {message !== null && (
          <p
            role="alert"
            className="rounded-sm border border-crit-bd bg-crit-soft px-space-md py-space-sm text-body-default text-crit"
          >
            {message}
          </p>
        )}
        <div className="flex justify-end gap-space-sm border-t border-border pt-space-md">
          <button
            type="button"
            disabled={create.isPending}
            onClick={onClose}
            className="h-9 rounded-sm border border-border px-space-md text-body-default text-fg-muted hover:text-fg focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={create.isPending || chosen.length === 0}
            className={PRIMARY_BUTTON + ' h-9'}
          >
            <span aria-hidden="true" className={PRIMARY_ICON}>
              play_arrow
            </span>
            <span>{create.isPending ? 'Dispatching…' : 'Dispatch Job'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Opens the Run Scan modal: one job per chosen tool module on the selected assets, through
 * `POST /jobs/bulk-create` (N14) with a priority (D8). The backend checks scope per job. */
export function ScanButton({
  assets,
  programName,
  activeIps,
  compact = false,
  icon = 'play_arrow',
}: {
  assets: readonly ScanAsset[];
  programName: (programId: string) => string;
  activeIps?: number;
  compact?: boolean;
  icon?: string;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<number | null>(null);
  const toolModules = useToolModules();
  const programId = singleProgram(assets);
  const mixed = assets.length > 0 && programId === null;

  return (
    <>
      <button
        type="button"
        disabled={programId === null || toolModules.data === undefined}
        aria-describedby={mixed ? 'scan-mixed' : undefined}
        onClick={() => {
          setCreated(null);
          setOpen(true);
        }}
        className={compact ? COMPACT_BUTTON : PRIMARY_BUTTON}
      >
        <span
          aria-hidden="true"
          className={compact ? 'material-symbols-outlined text-[13px]' : PRIMARY_ICON}
        >
          {icon}
        </span>
        <span>Run Scan</span>
      </button>
      {mixed && (
        <span id="scan-mixed" className="text-caption text-warn">
          Select assets from one program to run a scan.
        </span>
      )}
      {created !== null && (
        <span role="status" className="text-caption text-good">
          {created === 1 ? 'Job created.' : `${COUNT.format(created)} jobs created.`}
        </span>
      )}
      {open && programId !== null && (
        <Body
          programId={programId}
          programName={programName(programId)}
          targets={assets.map((a) => a.target)}
          activeIps={activeIps}
          modules={toolModules.data?.items ?? []}
          onDone={(count) => {
            setOpen(false);
            setCreated(count);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
