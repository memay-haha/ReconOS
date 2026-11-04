'use client';

import { type FormEvent, type ReactElement, useRef, useState } from 'react';

import { FieldError } from '@/components/field-error';
import { Pagination, useCursorStack } from '@/components/pagination';
import { fieldErrorsOf } from '@/lib/api-client';
import {
  type EngineVariable,
  useDeleteEngineVariable,
  useEngineVariables,
  usePutEngineVariable,
} from '@/lib/engines';
import { formatMoment } from '@/lib/format-moment';

import {
  ALERT_TEXT,
  BUTTON_DANGER,
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  CELL,
  FIELD,
  HEAD,
  HEAD_ROW,
  LABEL,
  Modal,
  PANEL,
  ROW,
  STATE_TEXT,
} from '../system/modal';
import { loadErrorText, saveErrorText } from '../system/states';

/** Engine variables are credentials: the value is never returned, so the cell always shows
 * the same mask, whatever is stored. */
const MASK = '••••••••';

const ROW_BUTTON =
  'rounded-sm border border-border px-space-sm py-space-xs text-body-default text-fg hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-ring';

function VariableForm({
  engineId,
  existing,
  onClose,
}: {
  engineId: string;
  /** null adds a variable; a row replaces that variable's value. */
  existing: EngineVariable | null;
  onClose: () => void;
}): ReactElement {
  const [key, setKey] = useState(existing?.key ?? '');
  const valueRef = useRef<HTMLInputElement>(null);
  const put = usePutEngineVariable();
  const fields = fieldErrorsOf(put.error);
  const general = put.isError && Object.keys(fields).length === 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = valueRef.current?.value ?? '';
    if (key.trim() === '' || value === '') return;
    put.mutate(
      { engineId, key: key.trim(), value },
      {
        onSuccess: onClose,
        onSettled: () => {
          if (valueRef.current !== null) valueRef.current.value = '';
        },
      },
    );
  };

  return (
    <Modal
      title={existing === null ? 'Add engine variable' : 'Replace value'}
      busy={put.isPending}
      onClose={onClose}
    >
      <form method="post" onSubmit={submit} className="flex flex-col gap-gutter">
        <label htmlFor="variable-key" className={LABEL}>
          Key
          <input
            id="variable-key"
            required
            readOnly={existing !== null}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className={`${FIELD} text-body-code`}
          />
        </label>
        <FieldError errors={fields} field="key" />
        <label htmlFor="variable-value" className={LABEL}>
          Value
          <input
            id="variable-value"
            ref={valueRef}
            type="password"
            required
            autoComplete="off"
            className={`${FIELD} text-body-code`}
          />
        </label>
        <FieldError errors={fields} field="value" />
        {general && (
          <p role="alert" className="text-body-default text-crit">
            {saveErrorText(put.error)}
          </p>
        )}
        <div className="flex justify-end gap-space-sm">
          <button
            type="button"
            onClick={onClose}
            disabled={put.isPending}
            className={BUTTON_SECONDARY}
          >
            Cancel
          </button>
          <button type="submit" disabled={put.isPending} className={BUTTON_PRIMARY}>
            {put.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteVariable({
  engineId,
  variable,
  onClose,
}: {
  engineId: string;
  variable: EngineVariable;
  onClose: () => void;
}): ReactElement {
  const remove = useDeleteEngineVariable();
  return (
    <Modal title="Delete engine variable" busy={remove.isPending} onClose={onClose}>
      <div className="flex flex-col gap-gutter">
        <p className="text-body-default text-fg">
          Delete <code className="text-body-code">{variable.key}</code>? Workflows that read it stop
          receiving a value.
        </p>
        {remove.isError && (
          <p role="alert" className="text-body-default text-crit">
            {saveErrorText(remove.error)}
          </p>
        )}
        <div className="flex justify-end gap-space-sm">
          <button
            type="button"
            onClick={onClose}
            disabled={remove.isPending}
            className={BUTTON_SECONDARY}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={remove.isPending}
            onClick={() => remove.mutate({ engineId, key: variable.key }, { onSuccess: onClose })}
            className={BUTTON_DANGER}
          >
            {remove.isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

type Editing =
  | { mode: 'add' }
  | { mode: 'replace'; variable: EngineVariable }
  | { mode: 'delete'; variable: EngineVariable }
  | null;

export function VariablesPanel({ engineId }: { engineId: string }): ReactElement {
  const { cursor, canGoBack, goNext, goBack } = useCursorStack();
  const variables = useEngineVariables(engineId, cursor);
  const [editing, setEditing] = useState<Editing>(null);
  const close = () => setEditing(null);

  return (
    <div className="flex flex-col gap-space-md">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setEditing({ mode: 'add' })}
          className={BUTTON_PRIMARY}
        >
          Add variable
        </button>
      </div>
      <div className={PANEL}>
        {variables.isPending && <p className={STATE_TEXT}>Loading the engine variables…</p>}
        {variables.isError && (
          <p role="alert" className={ALERT_TEXT}>
            {loadErrorText(variables.error, 'engine variables')}
          </p>
        )}
        {variables.data !== undefined && (
          <>
            {variables.data.items.length === 0 ? (
              <p className={STATE_TEXT}>No engine variables yet.</p>
            ) : (
              <div className="w-full overflow-x-auto" tabIndex={0}>
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className={HEAD_ROW}>
                      <th scope="col" className={HEAD}>
                        Key
                      </th>
                      <th scope="col" className={HEAD}>
                        Value
                      </th>
                      <th scope="col" className={HEAD}>
                        Last Updated
                      </th>
                      <th scope="col" className={HEAD}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {variables.data.items.map((v) => (
                      <tr key={v.id} className={ROW}>
                        <td className={`${CELL} text-body-code`}>{v.key}</td>
                        <td className={`${CELL} text-body-code text-fg-muted`}>
                          <span aria-label="Hidden value">{MASK}</span>
                        </td>
                        <td className={`${CELL} text-body-code text-fg-muted`}>
                          {formatMoment(v.updated_at)}
                        </td>
                        <td className={CELL}>
                          <span className="flex gap-space-xs">
                            <button
                              type="button"
                              aria-label={`Replace value of ${v.key}`}
                              onClick={() => setEditing({ mode: 'replace', variable: v })}
                              className={ROW_BUTTON}
                            >
                              Replace
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete ${v.key}`}
                              onClick={() => setEditing({ mode: 'delete', variable: v })}
                              className={ROW_BUTTON}
                            >
                              Delete
                            </button>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="border-t border-border bg-surface-2 px-space-md">
              <Pagination
                label="Engine variable pagination"
                page={{
                  total: variables.data.total,
                  totalIsEstimate: variables.data.total_is_estimate,
                  nextCursor: variables.data.next_cursor,
                }}
                canGoBack={canGoBack}
                onBack={goBack}
                onNext={() => goNext(variables.data.next_cursor)}
              />
            </div>
          </>
        )}
      </div>
      {editing?.mode === 'add' && (
        <VariableForm engineId={engineId} existing={null} onClose={close} />
      )}
      {editing?.mode === 'replace' && (
        <VariableForm engineId={engineId} existing={editing.variable} onClose={close} />
      )}
      {editing?.mode === 'delete' && (
        <DeleteVariable engineId={engineId} variable={editing.variable} onClose={close} />
      )}
    </div>
  );
}
