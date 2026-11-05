import Link from 'next/link';
import type { ReactElement, ReactNode } from 'react';

import type { AssetEvent } from '@/lib/asset-events';
import { formatMoment } from '@/lib/format-moment';

const COUNT = new Intl.NumberFormat('en-US');

/** The colour of a KPI tile: the mockup gives each asset type its own accent. */
export type Accent = 'primary' | 'domain' | 'url' | 'ip' | 'service';

const ACCENT_BAR: Readonly<Record<Accent, string>> = {
  primary: 'bg-primary-container',
  domain: 'bg-asset-domain',
  url: 'bg-asset-url',
  ip: 'bg-asset-ip',
  service: 'bg-asset-service',
};

// The Programs tile keeps a muted icon under its cyan bar, as the mockup draws it.
const ACCENT_ICON: Readonly<Record<Accent, string>> = {
  primary: 'text-fg-faint',
  domain: 'text-asset-domain',
  url: 'text-asset-url',
  ip: 'text-asset-ip',
  service: 'text-asset-service',
};

/** One KPI of `GET /dashboard/summary`. `undefined` is still loading, `null` unavailable. */
export function StatTile({
  label,
  icon,
  accent,
  value,
}: {
  label: string;
  icon: string;
  accent: Accent;
  value: number | null | undefined;
}): ReactElement {
  return (
    <div
      data-stat-tile
      className="relative flex flex-col justify-between overflow-hidden rounded-sm bg-surface p-space-lg shadow-sm"
    >
      <div className={`absolute inset-x-0 top-0 h-[3px] ${ACCENT_BAR[accent]}`} />
      <div>
        <div className="flex items-start justify-between">
          <span className="font-label-caps text-label-caps tracking-wider text-fg-faint uppercase">
            {label}
          </span>
          <span
            aria-hidden="true"
            className={`material-symbols-outlined text-icon ${ACCENT_ICON[accent]}`}
          >
            {icon}
          </span>
        </div>
        <div className="mt-space-sm flex items-baseline gap-space-sm">
          {value === undefined ? (
            <span className="text-body-default text-fg-muted">Loading…</span>
          ) : value === null ? (
            <span className="text-body-default text-fg-muted">Unavailable</span>
          ) : (
            <span className="font-stat-lg text-stat-lg tracking-tight text-fg">
              {COUNT.format(value)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export type Tone = 'crit' | 'error' | 'warn' | 'info' | 'good' | 'neutral' | 'muted';

const BAR: Readonly<Record<Tone, string>> = {
  crit: 'bg-crit',
  error: 'bg-error',
  warn: 'bg-warn',
  info: 'bg-info',
  good: 'bg-good',
  neutral: 'bg-fg-muted',
  muted: 'bg-secondary-container',
};

const BADGE: Readonly<Record<Tone | 'total', string>> = {
  crit: 'bg-crit-soft text-crit',
  error: 'bg-crit-soft text-error',
  warn: 'bg-warn-soft text-warn',
  info: 'bg-info-soft text-info',
  good: 'bg-good-soft text-good',
  neutral: 'bg-surface-3 text-fg-muted',
  muted: 'bg-surface-3 text-fg-muted',
  total: 'bg-surface-3 text-fg-faint',
};

const PANEL_ICON = {
  crit: 'text-crit',
  primary: 'text-primary',
} as const;

const COLUMNS: Readonly<Record<number, string>> = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
};

export interface Breakdown {
  readonly key: string;
  readonly label: string;
  readonly tone: Tone;
  readonly count: number;
}

function Tile({
  id,
  label,
  tone,
  count,
  outlined,
}: {
  id: string;
  label: string;
  tone: Tone | 'total';
  count: number;
  outlined: boolean;
}): ReactElement {
  return (
    <div
      data-breakdown={id}
      className={`flex flex-col items-center rounded-sm bg-surface-2 p-space-sm ${outlined ? 'border border-border/40' : ''}`}
    >
      <span
        className={`rounded-sm px-1.5 py-0.5 font-label-caps text-label-caps uppercase ${BADGE[tone]}`}
      >
        {label}
      </span>
      <span className="mt-1 font-stat-lg text-stat-lg text-fg">{COUNT.format(count)}</span>
    </div>
  );
}

/** A stacked bar and one tile per part, as the mockup draws Findings by Severity and the
 * Staging Snapshot. */
export function BreakdownPanel({
  title,
  icon,
  iconTone,
  viewAll,
  parts,
  state,
  rows,
  total,
}: {
  title: string;
  icon: string;
  iconTone: keyof typeof PANEL_ICON;
  /** null while the list screen is not built: a link would lead nowhere. */
  viewAll: string | null;
  parts: readonly Breakdown[] | undefined;
  state: ReactNode;
  /** Tiles per row, top to bottom, as the mockup splits them (2 then 3 for severities). */
  rows: readonly number[];
  /** The sum of the parts, display only: a first tile with this label, or a footer line. */
  total: { readonly label: string; readonly as: 'tile' | 'footer' };
}): ReactElement {
  const sum = (parts ?? []).reduce((acc, p) => acc + p.count, 0);
  const tiles =
    parts === undefined
      ? []
      : [
          ...(total.as === 'tile'
            ? [
                <Tile
                  key="total"
                  id="total"
                  label={total.label}
                  tone="total"
                  count={sum}
                  outlined
                />,
              ]
            : []),
          ...parts.map((p) => (
            <Tile
              key={p.key}
              id={p.key}
              label={p.label}
              tone={p.tone}
              count={p.count}
              outlined={total.as === 'tile'}
            />
          )),
        ];
  // Each row starts where the rows before it end.
  const grid = rows.map((columns, index) => {
    const start = rows.slice(0, index).reduce((acc, n) => acc + n, 0);
    return (
      <div key={index} className={`grid gap-space-sm ${COLUMNS[columns] ?? 'grid-cols-4'}`}>
        {tiles.slice(start, start + columns)}
      </div>
    );
  });

  return (
    <div
      className="flex flex-col justify-between rounded-sm bg-surface p-space-lg shadow-sm"
      data-panel
    >
      <div>
        <div className="mb-space-md flex items-center justify-between">
          <div className="flex items-center gap-space-sm">
            <span
              aria-hidden="true"
              className={`material-symbols-outlined text-icon ${PANEL_ICON[iconTone]}`}
            >
              {icon}
            </span>
            <h2 className="font-panel-title text-panel-title text-fg">{title}</h2>
          </div>
          {viewAll !== null && (
            <Link href={viewAll} className="font-caption text-caption text-primary hover:underline">
              View all →
            </Link>
          )}
        </div>
        {parts === undefined ? (
          state
        ) : (
          <>
            <div
              aria-hidden="true"
              className="mb-gutter flex h-2.5 w-full overflow-hidden rounded-sm bg-surface-2"
            >
              {sum > 0 &&
                parts.map((p) => (
                  <div
                    key={p.key}
                    className={BAR[p.tone]}
                    style={{ width: `${(p.count / sum) * 100}%` }}
                  />
                ))}
            </div>
            <div className="space-y-space-sm text-center">{grid}</div>
          </>
        )}
      </div>
      {parts !== undefined && total.as === 'footer' && (
        <div className="mt-gutter flex items-center justify-end border-t border-surface-2 pt-space-md">
          <span className="font-body-code text-caption text-fg-muted">
            {total.label}: {COUNT.format(sum)}
          </span>
        </div>
      )}
    </div>
  );
}

const ASSET_ICON: Readonly<Record<AssetEvent['asset_type'], string>> = {
  domain: 'public',
  ip: 'dns',
  url: 'link',
  service: 'settings_ethernet',
};

// The mockup tints each event's icon square with the colour of its asset type.
const ASSET_TINT: Readonly<Record<AssetEvent['asset_type'], string>> = {
  domain: 'bg-asset-domain/10 text-asset-domain',
  ip: 'bg-asset-ip/10 text-asset-ip',
  url: 'bg-asset-url/10 text-asset-url',
  service: 'bg-asset-service/10 text-asset-service',
};

const VERB: Readonly<Record<AssetEvent['event_type'], string>> = {
  discovered: 'Discovered',
  changed: 'Changed',
};

/** One asset event. Names come from the target, so they are rendered as text only. */
export function ActivityRow({ event }: { event: AssetEvent }): ReactElement {
  return (
    <div
      data-activity
      className="flex items-center justify-between rounded-sm p-space-sm transition-colors hover:bg-surface-2"
    >
      <div className="flex min-w-0 items-center gap-space-md">
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-sm ${ASSET_TINT[event.asset_type]}`}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[15px]">
            {ASSET_ICON[event.asset_type]}
          </span>
        </div>
        <p className="min-w-0 truncate font-caption text-caption text-fg">
          {VERB[event.event_type]} {event.asset_type}{' '}
          <span className="font-body-code-bold text-primary">{event.asset_name}</span> under program{' '}
          <span className="font-body-code text-fg-muted">{event.program_name}</span>
        </p>
      </div>
      <span className="ml-space-md shrink-0 font-body-code text-caption text-fg-faint">
        {formatMoment(event.created_at)}
      </span>
    </div>
  );
}
