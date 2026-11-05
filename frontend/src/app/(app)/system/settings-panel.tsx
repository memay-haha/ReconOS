'use client';

import { type FormEvent, type ReactElement, useState } from 'react';

import { FieldError } from '@/components/field-error';
import { fieldErrorsOf } from '@/lib/api-client';
import { formatMoment } from '@/lib/format-moment';
import { type SystemSetting, usePatchSystemSetting, useSystemSettings } from '@/lib/system';

import {
  ALERT_TEXT,
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
} from './modal';
import { loadErrorText, saveErrorText } from './states';

const COUNT = new Intl.NumberFormat('en-US');

function shown(value: unknown): string {
  return typeof value === 'number' ? COUNT.format(value) : JSON.stringify(value);
}

function EditSetting({
  setting,
  onClose,
}: {
  setting: SystemSetting;
  onClose: () => void;
}): ReactElement {
  const [draft, setDraft] = useState(
    typeof setting.value === 'number' ? String(setting.value) : '',
  );
  const patch = usePatchSystemSetting();
  const fields = fieldErrorsOf(patch.error);
  const general = patch.isError && Object.keys(fields).length === 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (draft.trim() === '' || Number.isNaN(Number(draft))) return;
    patch.mutate({ key: setting.key, value: Number(draft) }, { onSuccess: onClose });
  };

  return (
    <Modal title="Edit threshold" busy={patch.isPending} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-gutter">
        <label htmlFor="setting-value" className={LABEL}>
          <span className="font-body-code text-body-code text-fg-muted">{setting.key}</span>
          <input
            id="setting-value"
            type="number"
            required
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className={FIELD}
          />
        </label>
        <FieldError errors={fields} field="value" />
        {general && (
          <p role="alert" className="text-body-default text-crit">
            {saveErrorText(patch.error)}
          </p>
        )}
        <div className="flex justify-end gap-space-sm">
          <button
            type="button"
            onClick={onClose}
            disabled={patch.isPending}
            className={BUTTON_SECONDARY}
          >
            Cancel
          </button>
          <button type="submit" disabled={patch.isPending} className={BUTTON_PRIMARY}>
            {patch.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** `system_setting`: docs/ops/configuration.md. Only a Superadmin reads or changes it, so the
 * screen renders this panel for a Superadmin only. */
export function SettingsPanel(): ReactElement {
  const settings = useSystemSettings();
  const [editing, setEditing] = useState<SystemSetting | null>(null);

  return (
    <div className={PANEL}>
      {settings.isPending && <p className={STATE_TEXT}>Loading the thresholds…</p>}
      {settings.isError && (
        <p role="alert" className={ALERT_TEXT}>
          {loadErrorText(settings.error, 'thresholds')}
        </p>
      )}
      {settings.data !== undefined && settings.data.items.length === 0 && (
        <p className={STATE_TEXT}>Every threshold uses its default.</p>
      )}
      {settings.data !== undefined && settings.data.items.length > 0 && (
        <div className="w-full overflow-x-auto" tabIndex={0}>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className={HEAD_ROW}>
                <th scope="col" className={HEAD}>
                  Setting
                </th>
                <th scope="col" className={HEAD}>
                  Value
                </th>
                <th scope="col" className={HEAD}>
                  Updated
                </th>
                <th scope="col" className={HEAD}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {settings.data.items.map((s) => (
                <tr key={s.key} className={ROW}>
                  <td className={`${CELL} font-body-code text-body-code`}>{s.key}</td>
                  <td className={`${CELL} font-body-code text-body-code`}>{shown(s.value)}</td>
                  <td className={`${CELL} font-body-code text-body-code text-fg-muted`}>
                    {formatMoment(s.updated_at)}
                  </td>
                  <td className={CELL}>
                    {typeof s.value === 'number' && (
                      <button
                        type="button"
                        onClick={() => setEditing(s)}
                        aria-label={`Edit ${s.key}`}
                        className="rounded-sm border border-border px-space-sm py-space-xs text-body-default text-fg hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing !== null && <EditSetting setting={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
