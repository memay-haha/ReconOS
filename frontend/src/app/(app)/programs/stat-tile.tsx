import type { ReactElement } from 'react';

import { COUNT } from './ui';

/** `undefined` is still loading. `null` is a figure the backend did not provide
 * (not built yet, or a 403): say so rather than show 0. */
export type Figure = number | null | undefined;

export type TileTone = 'primary' | 'good' | 'domain' | 'crit' | 'warn' | 'info' | 'muted';

const BAR: Readonly<Record<TileTone, string>> = {
  primary: 'bg-primary-container',
  good: 'bg-good',
  domain: 'bg-asset-domain',
  crit: 'bg-crit',
  warn: 'bg-warn',
  info: 'bg-info',
  muted: 'bg-fg-muted',
};

export function StatTile({
  label,
  icon,
  tone,
  value,
  note,
}: {
  label: string;
  icon: string;
  tone: TileTone;
  value: Figure;
  note?: string | null;
}): ReactElement {
  return (
    <div
      data-stat-tile
      className="relative flex flex-col justify-between overflow-hidden rounded-sm border border-border bg-surface p-space-lg"
    >
      <div aria-hidden="true" className={`absolute inset-x-0 top-0 h-0.5 ${BAR[tone]}`} />
      <div className="flex items-center justify-between">
        <span className="font-label-caps text-label-caps uppercase text-fg-faint">{label}</span>
        <span aria-hidden="true" className="material-symbols-outlined text-icon text-fg-muted">
          {icon}
        </span>
      </div>
      <div className="mt-space-sm">
        {value === undefined ? (
          <p className="text-body-default text-fg-muted">Loading…</p>
        ) : value === null ? (
          <p className="text-body-default text-fg-muted">Unavailable</p>
        ) : (
          <p className="font-stat-lg text-stat-lg text-fg">{COUNT.format(value)}</p>
        )}
      </div>
      {note != null && <p className="mt-space-xs text-caption text-fg-faint">{note}</p>}
    </div>
  );
}

/** The figure of a list query: its `total`, or why there is none. */
export function totalOf(query: {
  isPending: boolean;
  data?: { total: number } | undefined;
}): Figure {
  if (query.isPending) return undefined;
  return query.data?.total ?? null;
}
