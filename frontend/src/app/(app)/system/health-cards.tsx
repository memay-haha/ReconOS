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

function Tile({
  label,
  icon,
  value,
  unit,
}: {
  label: string;
  icon: string;
  value: Figure;
  unit: string;
}): ReactElement {
  return (
    <div
      data-stat-tile
      className="relative flex flex-col justify-between overflow-hidden rounded-sm border border-border bg-surface p-space-md"
    >
      <div className="absolute inset-x-0 top-0 h-0.5 bg-primary" />
      <div className="flex items-start justify-between">
        <span className="text-label-caps uppercase text-fg-faint">{label}</span>
        <span aria-hidden="true" className="material-symbols-outlined text-icon text-primary">
          {icon}
        </span>
      </div>
      <div className="my-space-sm">
        {value === undefined ? (
          <p className="text-body-default text-fg-muted">Loading…</p>
        ) : value === null ? (
          <p className="text-body-default text-fg-muted">Unavailable</p>
        ) : (
          <p className="text-stat-lg text-fg">
            {COUNT.format(value)} <span className="text-caption text-fg-muted">{unit}</span>
          </p>
        )}
      </div>
    </div>
  );
}

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
  return (
    <div className="grid grid-cols-1 gap-space-md sm:grid-cols-3">
      <Tile
        label="Services"
        icon="dns"
        value={healthy}
        unit={components === undefined ? '' : `of ${COUNT.format(components.length)} ok`}
      />
      <Tile label="Workers" icon="memory" value={workersOnline} unit="online" />
      <Tile label="Queue length" icon="swap_calls" value={queueLength} unit="jobs" />
    </div>
  );
}

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
            className="flex flex-col gap-space-sm rounded-sm border border-border bg-surface p-space-md"
          >
            <div className="flex items-start justify-between gap-space-sm">
              <div className="flex flex-col">
                <span className="text-panel-title text-fg">
                  {COMPONENT_LABEL[c.name] ?? c.name}
                </span>
                <span className="text-body-code text-fg-muted">{c.name}</span>
              </div>
              <span
                className={`inline-flex items-center rounded-sm border px-space-xs text-body-code ${status.tone}`}
              >
                {status.label}
              </span>
            </div>
            <dl className="flex flex-col gap-space-xs border-t border-border pt-space-sm text-caption">
              <div className="flex justify-between gap-space-sm">
                <dt className="text-fg-muted">Latency</dt>
                <dd className="text-body-code text-fg">
                  {c.latency_ms === null ? 'No reply' : `${COUNT.format(c.latency_ms)} ms`}
                </dd>
              </div>
              <div className="flex justify-between gap-space-sm">
                <dt className="text-fg-muted">Last check</dt>
                <dd className="text-body-code text-fg">{formatMoment(c.checked_at)}</dd>
              </div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
