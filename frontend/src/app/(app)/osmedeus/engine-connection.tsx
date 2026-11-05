'use client';

import { type FormEvent, type ReactElement, useRef, useState } from 'react';

import { FieldError } from '@/components/field-error';
import { ApiError, fieldErrorsOf } from '@/lib/api-client';
import { type Engine, type EnginePatchBody, usePatchEngine, useTestEngine } from '@/lib/engines';
import { formatMoment } from '@/lib/format-moment';

import { BUTTON_PRIMARY, BUTTON_SECONDARY } from '../system/modal';

const LABEL_CAPS = 'flex flex-col gap-1.5 text-label-caps uppercase text-fg-muted';
const INPUT_WRAP = 'relative flex items-center';
const INPUT_ICON =
  'material-symbols-outlined pointer-events-none absolute left-2.5 text-icon text-fg-faint';
const INPUT =
  'h-9 w-full rounded-sm bg-surface-2 pl-9 pr-3 font-body-code text-body-code normal-case tracking-normal text-fg placeholder:text-fg-faint focus:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-ring';
import { saveErrorText } from '../system/states';

function testErrorText(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) {
    return 'You do not have permission to test this engine.';
  }
  if (error instanceof TypeError) {
    return 'Cannot reach the server. Check your connection and try again.';
  }
  return 'The engine did not answer. Check the base URL and the API key.';
}

/** Base URL and API key of one engine (S16, S17). The API key is write-only: the field always
 * starts empty, nothing reveals or copies a stored key, and an empty field keeps it. */
export function EngineConnection({ engine }: { engine: Engine }): ReactElement {
  const [baseUrl, setBaseUrl] = useState(engine.base_url);
  const [saved, setSaved] = useState(false);
  // Uncontrolled, so the key never sits in a React value attribute: .claude/rules/security.md.
  const keyRef = useRef<HTMLInputElement>(null);
  const patch = usePatchEngine();
  const test = useTestEngine();
  const fields = fieldErrorsOf(patch.error);
  const general = patch.isError && Object.keys(fields).length === 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSaved(false);
    const apiKey = keyRef.current?.value ?? '';
    const body: EnginePatchBody =
      apiKey === '' ? { base_url: baseUrl } : { base_url: baseUrl, api_key: apiKey };
    patch.mutate(
      { engineId: engine.id, body },
      {
        onSuccess: () => setSaved(true),
        onSettled: () => {
          if (keyRef.current !== null) keyRef.current.value = '';
        },
      },
    );
  };

  const version = test.data?.version;

  return (
    <form method="post" onSubmit={submit} className="flex flex-col gap-space-md">
      <div className={LABEL_CAPS}>
        <label htmlFor={`${engine.name}-base-url`}>Base URL</label>
        <span className={INPUT_WRAP}>
          <span aria-hidden="true" className={INPUT_ICON}>
            router
          </span>
          <input
            id={`${engine.name}-base-url`}
            type="url"
            required
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            className={INPUT}
          />
        </span>
      </div>
      <FieldError errors={fields} field="base_url" />
      <div className={LABEL_CAPS}>
        <label htmlFor={`${engine.name}-api-key`}>API key</label>
        <span className={INPUT_WRAP}>
          <span aria-hidden="true" className={INPUT_ICON}>
            shield_lock
          </span>
          <input
            id={`${engine.name}-api-key`}
            ref={keyRef}
            type="password"
            autoComplete="off"
            placeholder="Leave blank to keep the current key"
            className={INPUT}
          />
        </span>
      </div>
      <FieldError errors={fields} field="api_key" />
      <p className="-mt-space-sm text-caption text-fg-muted">
        Last changed {formatMoment(engine.updated_at)}.
      </p>
      {general && (
        <p role="alert" className="text-body-default text-crit">
          {saveErrorText(patch.error)}
        </p>
      )}
      {saved && !patch.isPending && (
        <p role="status" className="text-body-default text-good">
          Connection saved.
        </p>
      )}
      {test.isSuccess && (
        <p role="status" className="text-body-default text-good">
          The engine answered{typeof version === 'string' && version !== '' ? `: ${version}` : '.'}
        </p>
      )}
      {test.isError && (
        <p role="alert" className="text-body-default text-crit">
          {testErrorText(test.error)}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-space-sm">
        <button
          type="button"
          onClick={() => test.mutate(engine.id)}
          disabled={test.isPending}
          className={BUTTON_SECONDARY}
        >
          {test.isPending ? 'Testing…' : 'Test connection'}
        </button>
        <button type="submit" disabled={patch.isPending} className={BUTTON_PRIMARY}>
          {patch.isPending ? 'Saving…' : 'Save connection'}
        </button>
      </div>
    </form>
  );
}
