'use client';

import { type FormEvent, type ReactElement, useRef, useState } from 'react';

import { FieldError } from '@/components/field-error';
import { ApiError, fieldErrorsOf } from '@/lib/api-client';
import { type Engine, type EnginePatchBody, usePatchEngine, useTestEngine } from '@/lib/engines';
import { formatMoment } from '@/lib/format-moment';

import { BUTTON_PRIMARY, BUTTON_SECONDARY, FIELD, LABEL } from '../system/modal';
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
    <form method="post" onSubmit={submit} className="flex flex-col gap-gutter">
      <label htmlFor={`${engine.name}-base-url`} className={LABEL}>
        Base URL
        <input
          id={`${engine.name}-base-url`}
          type="url"
          required
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          className={`${FIELD} text-body-code`}
        />
      </label>
      <FieldError errors={fields} field="base_url" />
      <label htmlFor={`${engine.name}-api-key`} className={LABEL}>
        API key
        <input
          id={`${engine.name}-api-key`}
          ref={keyRef}
          type="password"
          autoComplete="off"
          placeholder="Leave blank to keep the current key"
          className={`${FIELD} text-body-code`}
        />
      </label>
      <FieldError errors={fields} field="api_key" />
      <p className="text-caption text-fg-muted">Last changed {formatMoment(engine.updated_at)}.</p>
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
