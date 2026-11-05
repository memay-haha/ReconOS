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
      <div className="flex items-center justify-between bg-surface-3 px-3 py-1.5 text-label-caps uppercase text-fg-muted">
        <span>Response headers</span>
        <span className="font-body-code text-[10px]">{COUNT.format(entries.length)} shown</span>
      </div>
      <dl className="grid grid-cols-1 gap-2 p-2.5 font-body-code text-caption md:grid-cols-2 lg:grid-cols-3">
        {entries.map(([name, value]) => (
          <div
            key={name}
            data-header
            className="flex min-w-0 flex-col rounded-sm border border-border bg-surface p-1.5"
          >
            <dt className="break-all text-[11px] font-semibold text-primary">{name}</dt>
            <dd className="truncate text-fg" title={headerText(value)}>
              {headerText(value)}
            </dd>
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
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
      {technologies.map((t) => (
        <div
          key={t.technology_id}
          data-technology
          className="flex min-w-0 flex-col rounded-sm border border-border bg-surface-2 p-2 transition-colors hover:bg-surface-3"
        >
          <div className="mb-1.5 flex items-center justify-between gap-1">
            {/* Two-letter monogram, as the mockup marks each technology. */}
            <span
              aria-hidden="true"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border border-border bg-surface font-body-code text-[10px] font-semibold text-primary"
            >
              {t.name.slice(0, 2)}
            </span>
            <span className="truncate text-[10px] text-fg-muted">
              {t.category ?? 'Uncategorised'}
            </span>
          </div>
          <span className="truncate text-body-default font-medium text-fg">{t.name}</span>
          <span className="truncate font-body-code text-caption text-fg-muted">
            {t.version ?? 'Version unknown'}
          </span>
        </div>
      ))}
    </div>
  );
}
