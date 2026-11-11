'use client';

import { type FormEvent, type ReactElement, useState } from 'react';

import { FieldError } from '@/components/field-error';
import { ApiError, fieldErrorsOf } from '@/lib/api-client';
import { useCreateJob } from '@/lib/jobs';
import { usePrograms } from '@/lib/programs';
import { useScopeRules } from '@/lib/scope-rules';
import type { ToolModuleRow } from '@/lib/tool-modules';

import { BUTTON_PRIMARY, BUTTON_SECONDARY, FIELD, Modal } from '../system/modal';
import { loadErrorText } from '../system/states';

const LABEL = 'flex flex-col gap-1 text-label-caps uppercase text-fg-faint';
const INPUT = `${FIELD} font-body-code text-body-code normal-case`;

/** D7: Threads and Rate show only when the tool module's parameter schema declares the key. */
const TUNING_KEYS = ['threads', 'rate'] as const;
type TuningKey = (typeof TUNING_KEYS)[number];
const TUNING_LABEL: Readonly<Record<TuningKey, string>> = { threads: 'Threads', rate: 'Rate' };

const OUT_OF_SCOPE = 'A target is outside the program scope, or matches an Out-of-Scope rule.';
const UNEXPECTED = 'Could not create the job. Try again later.';

/** The backend decides scope and approval; this only names the outcome it reported. */
function errorText(error: unknown): string | null {
  if (error === null || error === undefined) return null;
  if (error instanceof ApiError) {
    if (error.code === 'target_out_of_scope') return OUT_OF_SCOPE;
    if (Object.keys(error.fieldErrors).length > 0) return null;
    return UNEXPECTED;
  }
  return error instanceof TypeError
    ? 'Cannot reach the server. Check your connection and try again.'
    : UNEXPECTED;
}

function initial(m: ToolModuleRow, key: TuningKey): string {
  const value = m.default_params[key] ?? m.param_schema.properties?.[key]?.default;
  return typeof value === 'number' ? String(value) : '';
}

/** N48: the program's first In-Scope rule, read once a program is chosen. */
function FirstRule({ programId }: { programId: string }): ReactElement {
  const rules = useScopeRules(programId);
  const first = rules.data?.items.find((r) => r.scope_type === 'in_scope');
  let text = 'Loading the scope…';
  if (rules.isError) text = loadErrorText(rules.error, 'scope');
  else if (rules.data !== undefined) text = first === undefined ? 'No In-Scope rule' : first.value;
  return (
    <span className="font-body-code text-caption normal-case text-fg-muted">In-Scope: {text}</span>
  );
}

/** Dispatch from S18: one job of this tool module on the chosen program. The backend checks
 * scope, parameters and approval; nothing here does. */
export function DispatchDialog({
  module,
  onDone,
  onClose,
}: {
  module: ToolModuleRow;
  onDone: () => void;
  onClose: () => void;
}): ReactElement {
  const programs = usePrograms({ status: 'active', limit: 200 });
  const create = useCreateJob();
  const [programId, setProgramId] = useState('');
  const [targets, setTargets] = useState('');
  const keys = TUNING_KEYS.filter((k) => module.param_schema.properties?.[k] !== undefined);
  const [tuning, setTuning] = useState<Readonly<Partial<Record<TuningKey, string>>>>(() =>
    Object.fromEntries(keys.map((k) => [k, initial(module, k)])),
  );
  const fields = fieldErrorsOf(create.error);
  const message = errorText(create.error);
  const items = programs.data?.items ?? [];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const target = targets
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');
    const params = Object.fromEntries(
      keys.filter((k) => (tuning[k] ?? '').trim() !== '').map((k) => [k, Number(tuning[k])]),
    );
    create.mutate(
      {
        program_id: programId,
        tool_module_id: module.id,
        target,
        ...(Object.keys(params).length > 0 ? { params } : {}),
      },
      { onSuccess: onDone },
    );
  };

  return (
    <Modal
      title="Dispatch Capability"
      icon="rocket_launch"
      busy={create.isPending}
      onClose={onClose}
    >
      <form onSubmit={submit} className="flex flex-col gap-space-md">
        <p className="font-body-code text-body-code text-primary">{module.name}</p>
        <label htmlFor="dispatch-program" className={LABEL}>
          Target Scope / Program
          <select
            id="dispatch-program"
            required
            value={programId}
            onChange={(e) => setProgramId(e.target.value)}
            className={INPUT}
          >
            <option value="">Choose a program</option>
            {items.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {programId !== '' && <FirstRule programId={programId} />}
        </label>
        {programs.isError && (
          <p role="alert" className="text-body-default text-crit">
            {loadErrorText(programs.error, 'program list')}
          </p>
        )}
        {programs.data !== undefined && items.length === 0 && (
          <p className="text-body-default text-fg-muted">No active program to run against.</p>
        )}
        <label htmlFor="dispatch-targets" className={LABEL}>
          Targets, one per line
          <textarea
            id="dispatch-targets"
            required
            rows={3}
            value={targets}
            onChange={(e) => setTargets(e.target.value)}
            className={`${INPUT} h-auto py-space-sm`}
          />
        </label>
        <FieldError errors={fields} field="target" />
        {keys.length > 0 && (
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-label-caps uppercase text-fg-faint">
              Concurrency &amp; Rate Limit
            </legend>
            <div className="grid grid-cols-2 gap-space-sm">
              {keys.map((k) => (
                <label key={k} htmlFor={`dispatch-${k}`} className={LABEL}>
                  {TUNING_LABEL[k]}
                  <input
                    id={`dispatch-${k}`}
                    type="number"
                    min={module.param_schema.properties?.[k]?.minimum}
                    max={module.param_schema.properties?.[k]?.maximum}
                    value={tuning[k] ?? ''}
                    onChange={(e) => setTuning((t) => ({ ...t, [k]: e.target.value }))}
                    className={INPUT}
                  />
                </label>
              ))}
            </div>
            <FieldError errors={fields} field="params" />
          </fieldset>
        )}
        <p className="flex items-center gap-2 rounded-sm border border-accent-soft-bd bg-accent-soft p-2.5 font-body-code text-caption text-primary">
          <span aria-hidden="true" className="material-symbols-outlined text-icon">
            info
          </span>
          {module.group === 'exploit'
            ? 'An Exploit job requires approval by an Admin who did not create it before it runs.'
            : 'The job joins the Queue; the dispatcher starts it when a slot is free.'}
        </p>
        {message !== null && (
          <p role="alert" className="text-body-default text-crit">
            {message}
          </p>
        )}
        <div className="flex justify-end gap-space-sm border-t border-border pt-space-sm">
          <button type="button" onClick={onClose} className={BUTTON_SECONDARY}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={programId === '' || create.isPending}
            className={`${BUTTON_PRIMARY} inline-flex items-center gap-1.5`}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-icon">
              play_arrow
            </span>
            {create.isPending ? 'Dispatching…' : 'Dispatch to Queue'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
