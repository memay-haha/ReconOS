import type { ReactElement } from 'react';

import { formatMoment } from '@/lib/format-moment';
import type { ComponentStatus, HealthComponent } from '@/lib/system';

const COUNT = new Intl.NumberFormat('en-US');

/** Display names for the components of docs/architecture/system.md. A name the backend adds
 * later still shows, as itself. */
const COMPONENT_LABEL: Readonly<Record<string, string>> = {
  api: 'Backend API',
  dispatcher: 'Dispatcher',
  background: 'Background process',
  beat: 'Celery Beat',
  postgres: 'PostgreSQL',
  reconos_log: 'Log database',
  redis: 'Redis',
  minio: 'MinIO',
  osmedeus: 'Osmedeus',
  vigolium: 'Vigolium',
};

export const STATUS_TONE: Readonly<Record<ComponentStatus, { label: string; tone: string }>> = {
  ok: { label: 'ok', tone: 'bg-good-soft text-good border-good-bd' },
  degraded: { label: 'degraded', tone: 'bg-warn-soft text-warn border-warn-bd' },
  down: { label: 'down', tone: 'bg-crit-soft text-crit border-crit-bd' },
};

/** `undefined` is still loading, `null` is not available to this account. */
type Figure = number | null | undefined;

const TILE_BAND = {
  healthy: 'bg-good',
  mixed: 'bg-gradient-to-r from-good via-warn to-warn-bd',
  workers: 'bg-good',
  queue: 'bg-primary',
} as const;
const TILE_ICON: Readonly<Record<keyof typeof TILE_BAND, string>> = {
  healthy: 'text-fg-muted',
  mixed: 'text-fg-muted',
  workers: 'text-good',
  queue: 'text-primary',
};

function Tile({
  label,
  icon,
  tone,
  value,
  of,
  unit,
  footer,
}: {
  label: string;
  icon: string;
  /** Headband and icon colour, one per tile as the mockup draws them. */
  tone: keyof typeof TILE_BAND;
  value: Figure;
  /** The whole the value is part of, drawn as "7 / 8" in the mockup. */
  of?: number;
  unit: string;
  footer?: ReactElement;
}): ReactElement {
  return (
    <div
      data-stat-tile
      className="relative flex flex-col justify-between overflow-hidden rounded-sm border border-border bg-surface p-space-md"
    >
      <div className={`absolute inset-x-0 top-0 h-1 ${TILE_BAND[tone]}`} />
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-label-caps uppercase text-fg-faint">{label}</span>
          <span
            aria-hidden="true"
            className={`material-symbols-outlined text-icon ${TILE_ICON[tone]}`}
          >
            {icon}
          </span>
        </div>
        {value === undefined ? (
          <p className="text-body-default text-fg-muted">Loading…</p>
        ) : value === null ? (
          <p className="text-body-default text-fg-muted">Unavailable</p>
        ) : (
          <p className="font-stat-lg text-stat-lg tracking-tight text-fg">
            {COUNT.format(value)}
            {of !== undefined && ` / ${COUNT.format(of)}`}{' '}
            <span className="font-body-default text-caption font-normal text-fg-muted">{unit}</span>
          </p>
        )}
      </div>
      {footer !== undefined && (
        <div className="mt-space-sm flex items-center justify-between border-t border-border pt-space-xs font-body-code text-caption">
          {footer}
        </div>
      )}
    </div>
  );
}

const PERCENT = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 });

export function HealthTiles({
  components,
  workersOnline,
  queueLength,
}: {
  components: readonly HealthComponent[] | undefined;
  workersOnline: Figure;
  queueLength: Figure;
}): ReactElement {
  const healthy = components?.filter((c) => c.status === 'ok').length;
  const unhealthy = components?.filter((c) => c.status !== 'ok') ?? [];
  const footer =
    components === undefined || components.length === 0 ? undefined : (
      <>
        {unhealthy.length === 0 ? (
          <span className="text-good">All components ok</span>
        ) : (
          <span className="flex items-center gap-1 truncate text-warn">
            <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
            {COUNT.format(unhealthy.length)} not ok (
            {unhealthy.map((c) => COMPONENT_LABEL[c.name] ?? c.name).join(', ')})
          </span>
        )}
        <span className="text-fg-faint">{PERCENT.format((healthy ?? 0) / components.length)}</span>
      </>
    );
  return (
    <div className="grid grid-cols-1 gap-space-md sm:grid-cols-3">
      <Tile
        label="Services"
        icon="dns"
        tone={unhealthy.length === 0 ? 'healthy' : 'mixed'}
        value={healthy}
        of={components?.length}
        unit="ok"
        footer={footer}
      />
      <Tile label="Workers" icon="memory" tone="workers" value={workersOnline} unit="online" />
      <Tile label="Queue length" icon="swap_calls" tone="queue" value={queueLength} unit="jobs" />
    </div>
  );
}

/** Card frame and latency colour follow the status, as the mockup's degraded Vigolium card. */
const CARD_FRAME: Readonly<Record<ComponentStatus, string>> = {
  ok: 'border-border hover:border-border-strong',
  degraded: 'border-warn-bd',
  down: 'border-crit-bd',
};
const LATENCY_TONE: Readonly<Record<ComponentStatus, string>> = {
  ok: 'text-good',
  degraded: 'text-warn',
  down: 'text-crit',
};
const STATUS_DOT: Readonly<Record<ComponentStatus, string>> = {
  ok: 'bg-good',
  degraded: 'bg-warn',
  down: 'bg-crit',
};

export function HealthCards({
  components,
}: {
  components: readonly HealthComponent[];
}): ReactElement {
  if (components.length === 0) {
    return <p className="py-space-xl text-body-default text-fg-muted">No components reported.</p>;
  }
  return (
    <ul className="grid grid-cols-1 gap-space-md md:grid-cols-2 lg:grid-cols-4">
      {components.map((c) => {
        const status = STATUS_TONE[c.status];
        return (
          <li
            key={c.name}
            className={`flex flex-col rounded-sm border bg-surface p-space-md ${CARD_FRAME[c.status]}`}
          >
            <div className="mb-space-sm flex items-start justify-between gap-2">
              <div className="flex flex-col">
                <span className="text-panel-title text-fg">
                  {COMPONENT_LABEL[c.name] ?? c.name}
                </span>
                <span className="font-body-code text-caption text-fg-faint">{c.name}</span>
              </div>
              <span
                className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-body-code text-caption font-semibold ${status.tone}`}
              >
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[c.status]}`}
                />
                {status.label}
              </span>
            </div>
            <dl className="flex flex-col gap-1.5 border-t border-border pt-2 font-body-code text-caption">
              <div className="flex items-center justify-between gap-space-sm text-fg-faint">
                <dt>Latency</dt>
                <dd className={`font-semibold ${LATENCY_TONE[c.status]}`}>
                  {c.latency_ms === null ? 'No reply' : `${COUNT.format(c.latency_ms)} ms`}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-space-sm text-fg-faint">
                <dt>Last check</dt>
                <dd className="text-fg-muted">{formatMoment(c.checked_at)}</dd>
              </div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
