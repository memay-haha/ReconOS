import Link from 'next/link';
import type { ReactElement, ReactNode } from 'react';

import type { AssetEvent } from '@/lib/asset-events';
import { formatMoment } from '@/lib/format-moment';

const COUNT = new Intl.NumberFormat('en-US');

/** One KPI of `GET /dashboard/summary`. `undefined` is still loading, `null` unavailable. */
export function StatTile({
  label,
  icon,
  value,
}: {
  label: string;
  icon: string;
  value: number | null | undefined;
}): ReactElement {
  return (
    <div
      data-stat-tile
      className="relative flex flex-col justify-between overflow-hidden rounded-sm bg-surface p-space-lg"
    >
      <div className="absolute inset-x-0 top-0 h-0.5 bg-primary-container" />
      <div>
        <div className="flex items-start justify-between">
          <span className="text-label-caps uppercase text-fg-faint">{label}</span>
          <span aria-hidden="true" className="material-symbols-outlined text-icon text-fg-faint">
            {icon}
          </span>
        </div>
        <div className="mt-space-sm">
          {value === undefined ? (
            <span className="text-body-default text-fg-muted">Loading…</span>
          ) : value === null ? (
            <span className="text-body-default text-fg-muted">Unavailable</span>
          ) : (
            <span className="text-stat-lg text-fg">{COUNT.format(value)}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export type Tone = 'crit' | 'error' | 'warn' | 'info' | 'good' | 'neutral';

const BAR: Readonly<Record<Tone, string>> = {
  crit: 'bg-crit',
  error: 'bg-error',
  warn: 'bg-warn',
  info: 'bg-info',
  good: 'bg-good',
  neutral: 'bg-fg-muted',
};

const BADGE: Readonly<Record<Tone, string>> = {
  crit: 'bg-crit-soft text-crit',
  error: 'bg-crit-soft text-crit',
  warn: 'bg-warn-soft text-warn',
  info: 'bg-info-soft text-info',
  good: 'bg-good-soft text-good',
  neutral: 'bg-surface-3 text-fg-muted',
};

export interface Breakdown {
  readonly key: string;
  readonly label: string;
  readonly tone: Tone;
  readonly count: number;
}

/** A stacked bar and one tile per part, as the mockup draws Findings by Severity. */
export function BreakdownPanel({
  title,
  icon,
  viewAll,
  parts,
  state,
}: {
  title: string;
  icon: string;
  /** null while the list screen is not built: a link would lead nowhere. */
  viewAll: string | null;
  parts: readonly Breakdown[] | undefined;
  state: ReactNode;
}): ReactElement {
  const total = (parts ?? []).reduce((sum, p) => sum + p.count, 0);
  return (
    <div className="rounded-sm bg-surface p-space-lg" data-panel>
      <div className="mb-space-md flex items-center justify-between">
        <div className="flex items-center gap-space-sm">
          <span aria-hidden="true" className="material-symbols-outlined text-icon text-primary">
            {icon}
          </span>
          <h2 className="text-panel-title text-fg">{title}</h2>
        </div>
        {viewAll !== null && (
          <Link href={viewAll} className="text-caption text-primary hover:underline">
            View all
          </Link>
        )}
      </div>
      {parts === undefined ? (
        state
      ) : (
        <>
          <div
            aria-hidden="true"
            className="mb-space-lg flex h-2.5 w-full overflow-hidden rounded-sm bg-surface-2"
          >
            {total > 0 &&
              parts.map((p) => (
                <div
                  key={p.key}
                  className={BAR[p.tone]}
                  style={{ width: `${(p.count / total) * 100}%` }}
                />
              ))}
          </div>
          <div className="grid grid-cols-2 gap-space-sm text-center sm:grid-cols-3 lg:grid-cols-4">
            {parts.map((p) => (
              <div
                key={p.key}
                data-breakdown={p.key}
                className="flex flex-col items-center rounded-sm bg-surface-2 p-space-sm"
              >
                <span
                  className={`rounded-sm px-space-xs text-label-caps uppercase ${BADGE[p.tone]}`}
                >
                  {p.label}
                </span>
                <span className="mt-space-xs text-stat-lg text-fg">{COUNT.format(p.count)}</span>
              </div>
            ))}
          </div>
        </>
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

const VERB: Readonly<Record<AssetEvent['event_type'], string>> = {
  discovered: 'Discovered',
  changed: 'Changed',
};

/** One asset event. Names come from the target, so they are rendered as text only. */
export function ActivityRow({ event }: { event: AssetEvent }): ReactElement {
  return (
    <div
      data-activity
      className="flex items-center justify-between gap-space-sm rounded-sm p-space-sm"
    >
      <div className="flex min-w-0 items-center gap-space-md">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-surface-2">
          <span aria-hidden="true" className="material-symbols-outlined text-icon text-primary">
            {ASSET_ICON[event.asset_type]}
          </span>
        </div>
        <p className="min-w-0 break-words text-caption text-fg">
          {VERB[event.event_type]} {event.asset_type}{' '}
          <span className="text-body-code text-fg">{event.asset_name}</span> under program{' '}
          <span className="text-body-code text-fg-muted">{event.program_name}</span>
        </p>
      </div>
      <span className="shrink-0 text-body-code text-fg-muted">
        {formatMoment(event.created_at)}
      </span>
    </div>
  );
}
