'use client';

import { type FormEvent, type ReactElement, useCallback, useState } from 'react';

import { domainExportHref, EXPORT_FORMATS, useBulkDeleteDomains } from '@/lib/domains';
import { useBulkTagAssets, useTags } from '@/lib/tags';

import { BAR_BUTTON, BAR_ICON, BUTTON, COUNT, FIELD } from './asset-ui';
import { ConfirmDialog } from './modal';
import { Popover } from './popover';

const FORMAT_LABEL = { csv: 'CSV', jsonl: 'JSON Lines', md: 'Markdown' } as const;

/** Export only the selected rows: `ids` on the export, at most 500 (C3). */
export function ExportSelected({ ids }: { ids: readonly string[] }): ReactElement {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <Popover
      open={open}
      onClose={close}
      label="Export format"
      align="left"
      button={
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={BAR_BUTTON}
        >
          <span aria-hidden="true" className={BAR_ICON}>
            file_download
          </span>
          <span>Export</span>
        </button>
      }
    >
      <ul className="flex flex-col gap-0.5">
        {EXPORT_FORMATS.map((format) => (
          <li key={format}>
            <a
              href={domainExportHref({}, { format, ids })}
              download
              onClick={close}
              className="block rounded-sm px-2 py-1 text-xs text-fg hover:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {`${FORMAT_LABEL[format]} (${COUNT.format(ids.length)} rows)`}
            </a>
          </li>
        ))}
      </ul>
    </Popover>
  );
}

/** Puts one catalogue tag on every selected domain (N11). */
export function TagSelected({
  ids,
  onDone,
}: {
  ids: readonly string[];
  onDone: () => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [tagId, setTagId] = useState('');
  const close = useCallback(() => setOpen(false), []);
  const catalogue = useTags();
  const bulk = useBulkTagAssets();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (tagId === '') return;
    bulk.mutate(
      { tag_id: tagId, asset_type: 'domain', ids },
      {
        onSuccess: () => {
          setTagId('');
          setOpen(false);
          onDone();
        },
      },
    );
  };

  return (
    <Popover
      open={open}
      onClose={close}
      label="Tag the selected domains"
      align="left"
      button={
        <button
          type="button"
          aria-expanded={open}
          onClick={() => {
            bulk.reset();
            setOpen((v) => !v);
          }}
          className={BAR_BUTTON}
        >
          <span aria-hidden="true" className={BAR_ICON}>
            label
          </span>
          <span>Tag</span>
        </button>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-space-sm">
        <label
          htmlFor="domains-bulk-tag"
          className="text-label-caps uppercase tracking-wider text-fg-muted"
        >
          {`Tag ${COUNT.format(ids.length)} domains`}
        </label>
        <select
          id="domains-bulk-tag"
          value={tagId}
          onChange={(e) => setTagId(e.target.value)}
          className={FIELD}
        >
          <option value="">Choose a tag</option>
          {(catalogue.data?.items ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {`${t.key}: ${t.value}`}
            </option>
          ))}
        </select>
        <button type="submit" disabled={tagId === '' || bulk.isPending} className={BUTTON}>
          {bulk.isPending ? 'Tagging…' : 'Apply tag'}
        </button>
        {bulk.isError && (
          <p role="alert" className="text-caption text-crit">
            Could not tag the domains.
          </p>
        )}
      </form>
    </Popover>
  );
}

/** Soft delete of the selected domains (D5). Shown to Superadmin and Admin only; the backend
 * still decides. */
export function DeleteSelected({
  ids,
  onDone,
}: {
  ids: readonly string[];
  onDone: () => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const remove = useBulkDeleteDomains();
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          remove.reset();
          setOpen(true);
        }}
        className="inline-flex h-6 items-center gap-1 rounded-sm border border-crit-bd bg-crit-soft px-2 text-xs font-medium text-crit hover:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <span aria-hidden="true" className="material-symbols-outlined text-[13px]">
          delete
        </span>
        <span>Delete</span>
      </button>
      {open && (
        <ConfirmDialog
          title={`Delete ${COUNT.format(ids.length)} ${ids.length === 1 ? 'domain' : 'domains'}?`}
          message="The domains leave every list. Raw outputs stay stored, and the action is recorded in the audit log."
          confirmLabel="Delete"
          pending={remove.isPending}
          error={remove.isError ? 'Could not delete the domains.' : null}
          onConfirm={() =>
            remove.mutate(ids, {
              onSuccess: () => {
                setOpen(false);
                onDone();
              },
            })
          }
          onClose={close}
        />
      )}
    </>
  );
}
