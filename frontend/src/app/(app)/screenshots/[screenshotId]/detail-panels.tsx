import type { ReactElement } from 'react';

import type { UrlTechnology } from '@/lib/url-detail';

const COUNT = new Intl.NumberFormat('en-US');

/** Bytes in the unit a reader expects, `42.8 KB`. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${COUNT.format(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/** A header value as text: headers arrive as JSON, so a value may be a list or a number. */
function headerText(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** The response headers gowitness recorded. Untrusted target data: text only. */
export function HeaderList({
  headers,
}: {
  headers: Readonly<Record<string, unknown>> | null;
}): ReactElement {
  const entries = Object.entries(headers ?? {});
  if (entries.length === 0) {
    return <p className="text-body-default text-fg-muted">No response headers were recorded.</p>;
  }
  return (
    <div className="overflow-hidden rounded-sm border border-border bg-surface-2">
      <div className="flex items-center justify-between bg-surface-3 px-space-md py-space-xs text-caption text-fg-muted">
        <span>Response headers</span>
        <span className="text-body-code">{COUNT.format(entries.length)}</span>
      </div>
      <dl className="grid grid-cols-1 gap-space-sm p-space-sm text-body-code md:grid-cols-2 lg:grid-cols-3">
        {entries.map(([name, value]) => (
          <div
            key={name}
            data-header
            className="flex min-w-0 flex-col rounded-sm bg-surface p-space-sm"
          >
            <dt className="break-all text-body-code text-primary">{name}</dt>
            <dd className="break-all text-fg">{headerText(value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function TechnologyGrid({
  technologies,
}: {
  technologies: readonly UrlTechnology[];
}): ReactElement {
  if (technologies.length === 0) {
    return <p className="text-body-default text-fg-muted">No technologies detected on this URL.</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-space-sm sm:grid-cols-3 lg:grid-cols-4">
      {technologies.map((t) => (
        <div
          key={t.technology_id}
          data-technology
          className="flex min-w-0 flex-col rounded-sm bg-surface-2 p-space-sm"
        >
          <span className="text-caption text-fg-muted">{t.category ?? 'Uncategorised'}</span>
          <span className="truncate text-body-default text-fg">{t.name}</span>
          <span className="truncate text-body-code text-fg-muted">
            {t.version ?? 'Version unknown'}
          </span>
        </div>
      ))}
    </div>
  );
}
