'use client';

import { type FormEvent, type ReactElement, useState } from 'react';

import { FINDING_TAGS_MAX, type FindingDetail, useSetFindingTags } from '@/lib/findings';
import { useCreateTag, useTags } from '@/lib/tags';

import { FIELD } from '../system/modal';

const BUTTON =
  'inline-flex items-center gap-1 rounded-sm border border-border bg-surface px-2 py-1 font-body-code text-caption text-fg-muted hover:bg-surface-2 hover:text-fg focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60';

/** Tags of one finding. The API replaces the whole set, so every change sends the full list. */
export function FindingTags({ f }: { f: FindingDetail }): ReactElement {
  const catalogue = useTags();
  const save = useSetFindingTags();
  const create = useCreateTag();
  const [choice, setChoice] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const current = f.tags.map((t) => t.tag_id);
  const onFinding = new Set(current);
  const free = (catalogue.data?.items ?? []).filter((t) => !onFinding.has(t.id));
  const full = current.length >= FINDING_TAGS_MAX;
  const busy = save.isPending || create.isPending;

  const put = (tagIds: readonly string[], onDone?: () => void) =>
    save.mutate({ findingId: f.id, tagIds }, { onSuccess: onDone });

  const add = (event: FormEvent) => {
    event.preventDefault();
    if (choice === '' || full) return;
    put([...current, choice], () => setChoice(''));
  };

  // A new tag goes into the shared catalogue first, then onto this finding.
  const addNew = (event: FormEvent) => {
    event.preventDefault();
    const key = newKey.trim();
    const value = newValue.trim();
    if (key === '' || value === '' || full) return;
    create.mutate(
      { key, value },
      {
        onSuccess: (created) =>
          put([...current, created.id], () => {
            setNewKey('');
            setNewValue('');
          }),
      },
    );
  };

  return (
    <div className="rounded-sm border border-border bg-surface-2/40 p-space-md">
      {/* A label, not a heading: the mockup's dialog has no Tags section (M6). */}
      <p id="finding-tags-label" className="mb-2 text-label-caps uppercase text-fg-faint">
        Tags
      </p>
      <ul aria-labelledby="finding-tags-label" className="flex flex-wrap items-center gap-1.5">
        {f.tags.length === 0 && (
          <li className="font-body-code text-caption text-fg-muted">No tags.</li>
        )}
        {f.tags.map((t) => (
          <li
            key={t.tag_id}
            className="inline-flex items-center gap-0.5 rounded-sm border border-border bg-surface-3 pl-2 font-body-code text-caption text-secondary"
          >
            {`${t.key}: ${t.value}`}
            <button
              type="button"
              aria-label={`Remove tag ${t.key}: ${t.value}`}
              disabled={busy}
              onClick={() => put(current.filter((id) => id !== t.tag_id))}
              className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-fg-muted hover:text-fg focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[13px]">
                close
              </span>
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-space-sm flex flex-wrap items-center gap-space-xs">
        <label htmlFor="finding-tag" className="sr-only">
          Tag to add
        </label>
        <select
          id="finding-tag"
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          className={FIELD}
        >
          <option value="">Choose a tag</option>
          {free.map((t) => (
            <option key={t.id} value={t.id}>
              {`${t.key}: ${t.value}`}
            </option>
          ))}
        </select>
        <button type="submit" disabled={choice === '' || busy || full} className={BUTTON}>
          Add tag
        </button>
      </form>
      <form onSubmit={addNew} className="mt-space-xs flex flex-wrap items-center gap-space-xs">
        <label htmlFor="finding-tag-key" className="sr-only">
          New tag key
        </label>
        <input
          id="finding-tag-key"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          placeholder="key"
          maxLength={100}
          className={`${FIELD} w-28 font-body-code`}
        />
        <label htmlFor="finding-tag-value" className="sr-only">
          New tag value
        </label>
        <input
          id="finding-tag-value"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          placeholder="value"
          maxLength={255}
          className={`${FIELD} w-28 font-body-code`}
        />
        <button
          type="submit"
          disabled={newKey.trim() === '' || newValue.trim() === '' || busy || full}
          className={BUTTON}
        >
          Create tag
        </button>
      </form>
      {full && (
        <p className="mt-space-xs text-caption text-fg-muted">
          A finding takes at most {FINDING_TAGS_MAX} tags.
        </p>
      )}
      {(save.isError || create.isError) && (
        <p role="alert" className="mt-space-xs text-caption text-crit">
          {create.isError
            ? 'Could not create the tag. It may already exist.'
            : 'Could not save the tags.'}
        </p>
      )}
    </div>
  );
}
