'use client';

import { type FormEvent, type ReactElement, type ReactNode, useRef, useState } from 'react';

import { FieldError } from '@/components/field-error';
import { fieldErrorsOf } from '@/lib/api-client';
import { type Engine, type EnginePatchBody, usePatchEngine } from '@/lib/engines';
import { formatMoment } from '@/lib/format-moment';

import { saveErrorText } from '../system/states';

export const LABEL_CAPS = 'flex flex-col gap-1.5 text-label-caps uppercase text-fg-muted';
const INPUT_WRAP = 'relative flex items-center';
const INPUT_ICON =
  'material-symbols-outlined pointer-events-none absolute left-2.5 text-icon text-fg-faint';
export const INPUT =
  'h-9 w-full rounded-sm bg-surface-2 pl-9 pr-3 font-body-code text-body-code normal-case tracking-normal text-fg placeholder:text-fg-faint focus:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-ring';

/** The form the header's Save button submits, through its `form` attribute. */
export function engineFormId(engine: Engine): string {
  return `${engine.name}-engine-form`;
}

/** "9002" from the base URL, or the scheme default. Null when the URL does not parse. */
function portOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.port !== '') return parsed.port;
    return parsed.protocol === 'https:' ? '443' : parsed.protocol === 'http:' ? '80' : null;
  } catch {
    return null;
  }
}

/** Base URL and API key of one engine (S16, S17), plus the settings the page adds through
 * `extra`. The API key is write-only: the field always starts empty, nothing reveals or
 * copies a stored key, and an empty field keeps it. */
export function EngineConnection({
  engine,
  extra,
  onSaved,
  children,
}: {
  engine: Engine;
  /** Read at submit: settings and write-only fields of the page's other panels. */
  extra?: () => Partial<EnginePatchBody>;
  /** Called when the save settles, so the page clears its own write-only fields. */
  onSaved?: () => void;
  /** Rows the screen draws below the key, inside the same form. */
  children?: ReactNode;
}): ReactElement {
  const [baseUrl, setBaseUrl] = useState(engine.base_url);
  const [saved, setSaved] = useState(false);
  // Uncontrolled, so the key never sits in a React value attribute: .claude/rules/security.md.
  const keyRef = useRef<HTMLInputElement>(null);
  const patch = usePatchEngine();
  const fields = fieldErrorsOf(patch.error);
  const general = patch.isError && Object.keys(fields).length === 0;
  const port = portOf(baseUrl);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSaved(false);
    const apiKey = keyRef.current?.value ?? '';
    const body: EnginePatchBody = {
      base_url: baseUrl,
      ...(apiKey === '' ? {} : { api_key: apiKey }),
      ...extra?.(),
    };
    patch.mutate(
      { engineId: engine.id, body },
      {
        onSuccess: () => setSaved(true),
        onSettled: () => {
          if (keyRef.current !== null) keyRef.current.value = '';
          onSaved?.();
        },
      },
    );
  };

  const keyChanged = engine.api_key_updated_at ?? null;

  return (
    <form
      id={engineFormId(engine)}
      method="post"
      onSubmit={submit}
      className="flex flex-col gap-space-md"
    >
      <div className={LABEL_CAPS}>
        <span className="flex items-center justify-between">
          <label htmlFor={`${engine.name}-base-url`}>REST API Base URL</label>
          <span className="font-body-code text-[10px] normal-case tracking-normal text-fg-faint">
            REST/HTTPS
          </span>
        </span>
        <span className="flex items-center gap-space-sm">
          <span className={`${INPUT_WRAP} flex-1`}>
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
          {port !== null && (
            <span className="flex h-9 items-center rounded-sm border border-border bg-surface-2 px-2.5 font-body-code text-[11px] normal-case tracking-normal text-fg-muted">
              PORT: {port}
            </span>
          )}
        </span>
      </div>
      <FieldError errors={fields} field="base_url" />
      <div className={LABEL_CAPS}>
        <label htmlFor={`${engine.name}-api-key`}>API Key</label>
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
        {keyChanged === null
          ? 'The key has not been changed since the engine was added.'
          : `Key changed ${formatMoment(keyChanged)}. Write-only: it is never shown again.`}
      </p>
      {children}
      {general && (
        <p role="alert" className="text-body-default text-crit">
          {saveErrorText(patch.error)}
        </p>
      )}
      {saved && !patch.isPending && (
        <p role="status" className="text-body-default text-good">
          Changes saved.
        </p>
      )}
    </form>
  );
}
