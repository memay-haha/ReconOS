import type { ReactElement } from 'react';

import { COUNT } from './ui';

/** `undefined` is still loading. `null` is a figure the backend did not provide
 * (not built yet, or a 403): say so rather than show 0. */
export type Figure = number | null | undefined;

export type TileTone =
  'primary' | 'good' | 'domain' | 'url' | 'ip' | 'service' | 'crit' | 'warn' | 'info' | 'muted';

const BAR: Readonly<Record<TileTone, string>> = {
  primary: 'bg-primary-container',
  good: 'bg-good',
  domain: 'bg-asset-domain',
  url: 'bg-asset-url',
  ip: 'bg-asset-ip',
  service: 'bg-asset-service',
  crit: 'bg-crit',
  warn: 'bg-warn',
  info: 'bg-info',
  muted: 'bg-fg-muted',
};

/** Icon and figure take the tile's accent, as on the mockup; the domain tile keeps a plain figure. */
const ICON: Readonly<Record<TileTone, string>> = {
  primary: 'text-primary',
  good: 'text-good',
  // asset-domain misses 4.5:1 in the light theme; good is the nearest passing green.
  domain: 'text-good',
  url: 'text-asset-url',
  ip: 'text-asset-ip',
  service: 'text-asset-service',
  crit: 'text-crit',
  warn: 'text-warn',
  info: 'text-info',
  muted: 'text-fg-muted',
};

const FIGURE: Readonly<Record<TileTone, string>> = {
  primary: 'text-primary',
  good: 'text-good',
  domain: 'text-fg',
  url: 'text-fg',
  ip: 'text-fg',
  service: 'text-fg',
  crit: 'text-crit',
  warn: 'text-warn',
  info: 'text-info',
  muted: 'text-fg',
};

/* S08 draws roomy tiles with a 3 px bar; S09 packs five in a row with a 2 px bar and a
 * figure in the tile's accent. Literal ternaries below so the contrast scanner reads them. */

export function StatTile({
  label,
  icon,
  tone,
  value,
  note,
  dense = false,
}: {
  label: string;
  icon: string;
  tone: TileTone;
  value: Figure;
  note?: string | null;
  dense?: boolean;
}): ReactElement {
  const figure = dense ? ICON[tone] : FIGURE[tone];
  return (
    <div
      data-stat-tile
      className={
        dense
          ? 'relative flex flex-col overflow-hidden rounded-sm bg-surface p-space-md shadow-sm'
          : 'relative flex flex-col justify-between overflow-hidden rounded-sm bg-surface p-space-lg shadow-sm'
      }
    >
      <div
        aria-hidden="true"
        className={`absolute inset-x-0 top-0 ${dense ? 'h-0.5' : 'h-[3px]'} ${BAR[tone]}`}
      />
      <div
        className={
          dense ? 'mb-1 flex items-center justify-between' : 'flex items-center justify-between'
        }
      >
        <span className="font-label-caps text-label-caps uppercase text-fg-faint">{label}</span>
        <span aria-hidden="true" className={`material-symbols-outlined text-[18px] ${ICON[tone]}`}>
          {icon}
        </span>
      </div>
      <div className={dense ? '' : 'mt-3'}>
        {value === undefined ? (
          <p className="text-body-default text-fg-muted">Loading…</p>
        ) : value === null ? (
          <p className="text-body-default text-fg-muted">Unavailable</p>
        ) : (
          <p className={`font-stat-lg text-stat-lg tracking-tight ${figure}`}>
            {COUNT.format(value)}
          </p>
        )}
      </div>
      {note != null && (
        <p
          className={
            dense ? 'mt-1 truncate text-caption text-fg-muted' : 'mt-2 text-caption text-fg-faint'
          }
        >
          {note}
        </p>
      )}
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
