'use client';

import { type ReactElement, useState } from 'react';

import { copyText } from '../asset-ui';

/** Copies a value and says so in words; the clipboard may refuse, for example over plain HTTP. */
export function CopyButton({ value, label }: { value: string; label: string }): ReactElement {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle');
  const copy = () => {
    copyText(value).then(
      () => setState('done'),
      () => setState('failed'),
    );
  };
  const name =
    state === 'done' ? `${label}: copied` : state === 'failed' ? `${label}: failed` : label;
  return (
    <button
      type="button"
      aria-label={name}
      title={name}
      onClick={copy}
      className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-fg-muted hover:bg-surface-2 hover:text-fg focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <span aria-hidden="true" className="material-symbols-outlined text-icon">
        {state === 'done' ? 'check' : 'content_copy'}
      </span>
    </button>
  );
}
