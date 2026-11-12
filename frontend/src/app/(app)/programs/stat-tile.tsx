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

/** Small figure beside the main one ("+2 this month", "29 critical"), coloured by meaning. */
export type TrendTone = 'good' | 'primary' | 'crit' | 'warn' | 'muted';

const TREND: Readonly<Record<TrendTone, string>> = {
  good: 'text-good',
  primary: 'text-primary',
  crit: 'text-crit',
  warn: 'text-warn',
  muted: 'text-fg-muted',
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
  trend,
  trendIcon,
  trendTone = 'good',
  footer,
  footerValue,
  footerTone = 'muted',
}: {
  label: string;
  icon: string;
  tone: TileTone;
  value: Figure;
  note?: string | null;
  dense?: boolean;
  /** Beside the figure, as S08 draws "+2 this month". */
  trend?: string | null;
  trendIcon?: string | null;
  trendTone?: TrendTone;
  /** The S08 footer row: a caption on the left, a mono figure on the right. */
  footer?: string | null;
  footerValue?: string | null;
  footerTone?: TrendTone;
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
      <div className={dense ? 'flex items-baseline gap-2' : 'mt-3 flex items-baseline gap-2'}>
        {value === undefined ? (
          <p className="text-body-default text-fg-muted">Loading…</p>
        ) : value === null ? (
          <p className="text-body-default text-fg-muted">Unavailable</p>
        ) : (
          <p className={`font-stat-lg text-stat-lg tracking-tight ${figure}`}>
            {COUNT.format(value)}
          </p>
        )}
        {trend != null && (
          <span
            className={`flex items-center gap-0.5 font-body-code text-caption ${TREND[trendTone]}`}
          >
            {trendIcon != null && (
              <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
                {trendIcon}
              </span>
            )}
            {trend}
          </span>
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
      {(footer != null || footerValue != null) && (
        <div className="mt-3 flex items-center justify-between gap-2 text-caption">
          <span className="truncate text-fg-faint">{footer}</span>
          {footerValue != null && (
            <span className={`whitespace-nowrap font-body-code ${TREND[footerTone]}`}>
              {footerValue}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** "91.6%" from a part and a whole; null when the whole is unknown or zero. */
export function percentOf(part: Figure, whole: Figure): string | null {
  if (part == null || whole == null || whole === 0) return null;
  return `${((part / whole) * 100).toFixed(1)}%`;
}

/** The figure of a list query: its `total`, or why there is none. */
export function totalOf(query: {
  isPending: boolean;
  data?: { total: number } | undefined;
}): Figure {
  if (query.isPending) return undefined;
  return query.data?.total ?? null;
}
