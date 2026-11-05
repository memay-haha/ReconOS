'use client';

import { type FormEvent, type ReactElement, useState } from 'react';

import { FieldError } from '@/components/field-error';
import { fieldErrorsOf } from '@/lib/api-client';
import { type ToolModule, usePatchToolModule } from '@/lib/tool-modules';

import { BUTTON_PRIMARY, BUTTON_SECONDARY, FIELD, LABEL, Modal } from '../system/modal';
import { saveErrorText } from '../system/states';

/** Reads the textarea as a JSON object. Which keys are allowed is the backend's call: it checks
 * them against the tool module's parameter allowlist, so the screen only checks the format. */
function parseParams(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** The editable columns of `tool_module`: limits and default parameters. */
export function ModuleForm({
  module,
  onClose,
}: {
  module: ToolModule;
  onClose: () => void;
}): ReactElement {
  const [concurrency, setConcurrency] = useState(String(module.max_concurrency));
  const [rate, setRate] = useState(
    module.rate_limit_per_minute === null ? '' : String(module.rate_limit_per_minute),
  );
  const [timeout, setTimeoutMinutes] = useState(String(module.timeout_minutes));
  const [params, setParams] = useState(JSON.stringify(module.default_params, null, 2));
  const [badJson, setBadJson] = useState(false);
  const patch = usePatchToolModule();
  const fields = fieldErrorsOf(patch.error);
  const general = patch.isError && Object.keys(fields).length === 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const defaultParams = parseParams(params);
    setBadJson(defaultParams === null);
    if (defaultParams === null) return;
    patch.mutate(
      {
        toolModuleId: module.id,
        body: {
          default_params: defaultParams,
          max_concurrency: Number(concurrency),
          rate_limit_per_minute: rate.trim() === '' ? null : Number(rate),
          timeout_minutes: Number(timeout),
        },
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal title={`Configure ${module.name}`} busy={patch.isPending} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-gutter">
        <label htmlFor="module-concurrency" className={LABEL}>
          Max concurrent jobs
          <input
            id="module-concurrency"
            type="number"
            min={1}
            required
            value={concurrency}
            onChange={(e) => setConcurrency(e.target.value)}
            className={FIELD}
          />
        </label>
        <FieldError errors={fields} field="max_concurrency" />
        <label htmlFor="module-rate" className={LABEL}>
          Rate limit per minute
          <input
            id="module-rate"
            type="number"
            min={1}
            placeholder="No limit"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            className={FIELD}
          />
        </label>
        <FieldError errors={fields} field="rate_limit_per_minute" />
        <label htmlFor="module-timeout" className={LABEL}>
          Timeout, minutes
          <input
            id="module-timeout"
            type="number"
            min={1}
            required
            value={timeout}
            onChange={(e) => setTimeoutMinutes(e.target.value)}
            className={FIELD}
          />
        </label>
        <FieldError errors={fields} field="timeout_minutes" />
        <label htmlFor="module-params" className={LABEL}>
          Default parameters, JSON
          <textarea
            id="module-params"
            rows={6}
            spellCheck={false}
            value={params}
            onChange={(e) => setParams(e.target.value)}
            className="w-full rounded-sm bg-surface-2 px-space-md py-space-sm font-body-code text-body-code text-fg focus:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        {badJson && (
          <p role="alert" className="text-body-default text-crit">
            Enter the default parameters as a JSON object.
          </p>
        )}
        <FieldError errors={fields} field="default_params" />
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
