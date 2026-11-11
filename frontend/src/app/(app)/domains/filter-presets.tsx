'use client';

import { type FormEvent, type ReactElement, useCallback, useState } from 'react';

import { ApiError } from '@/lib/api-client';
import {
  type SavedFilter,
  useCreateSavedFilter,
  useDeleteSavedFilter,
  useSavedFilters,
} from '@/lib/saved-filters';

import { BUTTON, BUTTON_ICON, FIELD } from './asset-ui';
import { Popover } from './popover';

/** Filter Presets (N10): the account's saved filters for one list screen. `params` are the
 * list endpoint's query parameters, so a preset means the same on every client. */
export function FilterPresets({
  screen,
  current,
  onApply,
}: {
  screen: string;
  current: Readonly<Record<string, unknown>>;
  onApply: (params: Readonly<Record<string, unknown>>) => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const presets = useSavedFilters(screen);
  const create = useCreateSavedFilter();
  const remove = useDeleteSavedFilter();
  const close = useCallback(() => setOpen(false), []);

  const save = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '') return;
    create.mutate({ screen, name: trimmed, params: current }, { onSuccess: () => setName('') });
  };

  const apply = (preset: SavedFilter) => {
    onApply(preset.params);
    setOpen(false);
  };

  const duplicate = create.error instanceof ApiError && create.error.status === 409;

  return (
    <Popover
      open={open}
      onClose={close}
      label="Filter presets"
      button={
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={BUTTON}
        >
          <span aria-hidden="true" className={BUTTON_ICON}>
            tune
          </span>
          <span>Filter Presets</span>
        </button>
      }
    >
      <div className="flex flex-col gap-space-sm">
        <span className="px-1 text-label-caps uppercase tracking-wider text-fg-muted">
          Saved filters
        </span>
        {presets.isPending && <p className="px-1 text-caption text-fg-muted">Loading…</p>}
        {presets.isError && (
          <p role="alert" className="px-1 text-caption text-crit">
            Could not load the presets.
          </p>
        )}
        {presets.data?.items.length === 0 && (
          <p className="px-1 text-caption text-fg-muted">No saved filters yet.</p>
        )}
        <ul className="flex flex-col gap-0.5">
          {presets.data?.items.map((preset) => (
            <li key={preset.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => apply(preset)}
                className="min-w-0 flex-1 truncate rounded-sm px-2 py-1 text-left text-xs text-fg hover:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {preset.name}
              </button>
              <button
                type="button"
                aria-label={`Delete preset ${preset.name}`}
                disabled={remove.isPending}
                onClick={() => remove.mutate(preset.id)}
                className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-fg-muted hover:bg-surface-3 hover:text-crit focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[15px]">
                  delete
                </span>
              </button>
            </li>
          ))}
        </ul>
        <form
          onSubmit={save}
          className="flex items-center gap-1 border-t border-border pt-space-sm"
        >
          <label htmlFor={`${screen}-preset-name`} className="sr-only">
            Preset name
          </label>
          <input
            id={`${screen}-preset-name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name the current filters"
            className={FIELD + ' min-w-0 flex-1'}
          />
          <button
            type="submit"
            disabled={name.trim() === '' || create.isPending}
            className={BUTTON}
          >
            Save
          </button>
        </form>
        {create.isError && (
          <p role="alert" className="px-1 text-caption text-crit">
            {duplicate ? 'A preset with this name exists.' : 'Could not save the preset.'}
          </p>
        )}
        {remove.isError && (
          <p role="alert" className="px-1 text-caption text-crit">
            Could not delete the preset.
          </p>
        )}
      </div>
    </Popover>
  );
}
