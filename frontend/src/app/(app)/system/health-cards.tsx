import Link from 'next/link';
import type { ReactElement, ReactNode } from 'react';

import type { DispatcherStatus } from '@/lib/dispatcher';
import { formatAgo } from '@/lib/format-ago';
import { formatMoment } from '@/lib/format-moment';
import type { ComponentStatus, HealthComponent } from '@/lib/system';

const COUNT = new Intl.NumberFormat('en-US');
const PERCENT = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 });

/** Display names and one-line roles for the components of docs/architecture/system.md. A
 * name the backend adds later still shows, as itself. */
export const COMPONENT_LABEL: Readonly<Record<string, string>> = {
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

const COMPONENT_ROLE: Readonly<Record<string, string>> = {
  api: 'REST, WebSocket, auth & scope checks',
  dispatcher: 'Job dispatch & concurrency limits',
  background: 'Parse & schedule queues',
  beat: 'Schedule task sender',
  postgres: 'Primary recon datastore',
  reconos_log: 'Application log store',
  redis: 'Celery broker & realtime pub/sub',
  minio: 'Raw output object store',
  osmedeus: 'Recon workflow engine',
  vigolium: 'Web scanning engine',
};

/** Engine cards link to their settings screen (Superadmin). */
const SETTINGS_ROUTE: Readonly<Record<string, string>> = {
  osmedeus: '/osmedeus',
  vigolium: '/vigolium',
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
  tools: 'bg-info',
  workers: 'bg-good',
  queue: 'bg-primary',
} as const;
const TILE_ICON: Readonly<Record<keyof typeof TILE_BAND, string>> = {
  healthy: 'text-fg-muted',
  mixed: 'text-fg-muted',
  tools: 'text-info',
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
  footer?: ReactNode;
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
            className={`material-symbols-outlined text-[16px] ${TILE_ICON[tone]}`}
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
        <div className="mt-space-sm flex items-center justify-between gap-space-sm border-t border-border pt-space-xs font-body-code text-caption">
          {footer}
        </div>
      )}
    </div>
  );
}

export function HealthTiles({
  components,
  workersOnline,
  queueLength,
  tools,
  missingTools,
  fleetLoad,
}: {
  components: readonly HealthComponent[] | undefined;
  workersOnline: Figure;
  queueLength: Figure;
  /** `tools_installed` (M34). */
  tools: { installed: number; total: number } | null | undefined;
  /** Names of tools no online worker has, from `GET /tools`. */
  missingTools: readonly string[] | null;
  /** 0..1 (M24). */
  fleetLoad: number | null | undefined;
}): ReactElement {
  const healthy = components?.filter((c) => c.status === 'ok').length;
  const unhealthy = components?.filter((c) => c.status !== 'ok') ?? [];
  const redis = components?.find((c) => c.name === 'redis');
  const servicesFooter =
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
  const toolsFooter =
    tools == null ? undefined : (
      <>
        {missingTools !== null && missingTools.length > 0 ? (
          <span className="flex items-center gap-1 truncate text-warn">
            <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
              report
            </span>
            {COUNT.format(missingTools.length)} missing ({missingTools.join(', ')})
          </span>
        ) : (
          <span className="flex items-center gap-1 text-info">
            <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
              verified
            </span>
            All tools installed
          </span>
        )}
        <span className="shrink-0 text-fg-faint">tool modules</span>
      </>
    );
  const load = fleetLoad ?? null;
  const loadPercent = load === null ? null : Math.round(Math.min(Math.max(load, 0), 1) * 100);
  const workersFooter =
    loadPercent === null ? undefined : (
      <>
        <span className={loadPercent >= 90 ? 'text-warn' : 'text-good'}>
          fleet load {loadPercent}%
        </span>
        <span
          role="meter"
          aria-label="Fleet load"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={loadPercent}
          className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2"
        >
          <span
            className={`block h-full ${loadPercent >= 90 ? 'bg-warn' : 'bg-good'}`}
            // A runtime width has no Tailwind class; style carries no colour.
            style={{ width: `${loadPercent}%` }}
          />
        </span>
      </>
    );
  const queueFooter = (
    <>
      <span className="text-primary">
        {redis?.version == null ? 'Redis' : `Redis ${redis.version}`}
      </span>
      <Link
        href="/queue"
        className="inline-flex items-center gap-0.5 font-label-caps text-[10px] uppercase text-primary hover:underline"
      >
        Queue
        <span aria-hidden="true" className="material-symbols-outlined text-[12px]">
          chevron_right
        </span>
      </Link>
    </>
  );
  return (
    <div className="grid grid-cols-1 gap-space-md sm:grid-cols-2 lg:grid-cols-4">
      <Tile
        label="Services"
        icon="dns"
        tone={unhealthy.length === 0 ? 'healthy' : 'mixed'}
        value={healthy}
        of={components?.length}
        unit="ok"
        footer={servicesFooter}
      />
      <Tile
        label="Tools"
        icon="terminal"
        tone="tools"
        value={tools === undefined ? undefined : (tools?.installed ?? null)}
        of={tools?.total}
        unit="installed"
        footer={toolsFooter}
      />
      <Tile
        label="Workers"
        icon="memory"
        tone="workers"
        value={workersOnline}
        unit="online"
        footer={workersFooter}
      />
      <Tile
        label="Queue Depth"
        icon="swap_calls"
        tone="queue"
        value={queueLength}
        unit="jobs"
        footer={queueFooter}
      />
    </div>
  );
}

/** Card frame and latency colour follow the status, as the mockup's degraded Vigolium card. */
const CARD_FRAME: Readonly<Record<ComponentStatus, string>> = {
  ok: 'border border-border hover:border-border-strong',
  degraded: 'border-2 border-warn-bd',
  down: 'border-2 border-crit-bd',
};
const STATUS_DOT: Readonly<Record<ComponentStatus, string>> = {
  ok: 'bg-good',
  degraded: 'bg-warn',
  down: 'bg-crit',
};
const RECHECK: Readonly<Record<ComponentStatus, string>> = {
  ok: 'border-border bg-surface-2 text-fg hover:bg-surface-3',
  degraded: 'border-warn-bd bg-warn-soft text-warn',
  down: 'border-crit-bd bg-crit-soft text-crit',
};
const CORNER: Readonly<Record<ComponentStatus, string>> = {
  ok: '',
  degraded: 'border-warn-bd bg-warn-soft text-warn',
  down: 'border-crit-bd bg-crit-soft text-crit',
};

const ROW_TONE = {
  fg: 'text-fg',
  muted: 'text-fg-muted',
  ok: 'font-semibold text-good',
  degraded: 'font-semibold text-warn',
  down: 'font-semibold text-crit',
} as const;

function Row({
  label,
  children,
  tone = 'fg',
}: {
  label: string;
  children: ReactNode;
  tone?: keyof typeof ROW_TONE;
}): ReactElement {
  return (
    <div className="flex items-center justify-between gap-space-sm text-fg-faint">
      <dt>{label}</dt>
      <dd className={`min-w-0 max-w-[150px] truncate ${ROW_TONE[tone]}`}>{children}</dd>
    </div>
  );
}

function ago(value: string | null | undefined): string {
  return value == null ? 'Never' : formatAgo(value);
}

export function HealthCards({
  components,
  endpoints,
  dispatcher,
  canConfigure,
  rechecking,
  onRecheck,
}: {
  components: readonly HealthComponent[];
  /** `engine.base_url` by engine name, Superadmin only (N40). */
  endpoints: Readonly<Record<string, string>>;
  dispatcher: DispatcherStatus | undefined;
  /** Superadmin: engine cards link to their settings. */
  canConfigure: boolean;
  /** Name of the component being rechecked, if any. */
  rechecking: string | null;
  onRecheck: (name: string) => void;
}): ReactElement {
  if (components.length === 0) {
    return <p className="py-space-xl text-body-default text-fg-muted">No components reported.</p>;
  }
  return (
    <ul className="grid grid-cols-1 gap-space-md md:grid-cols-2 lg:grid-cols-4">
      {components.map((c) => {
        const status = STATUS_TONE[c.status];
        const endpoint = endpoints[c.name];
        const settings = SETTINGS_ROUTE[c.name];
        const isDispatcher = c.name === 'dispatcher';
        return (
          <li
            key={c.name}
            className={`relative flex flex-col justify-between rounded-sm bg-surface p-space-md transition-colors ${CARD_FRAME[c.status]}`}
          >
            {c.status !== 'ok' && (
              <span
                aria-hidden="true"
                className={`absolute -top-2.5 right-3 rounded-sm border px-1.5 font-body-code text-[10px] font-bold uppercase ${CORNER[c.status]}`}
              >
                {status.label}
              </span>
            )}
            <div>
              <div className="mb-space-sm flex items-start justify-between gap-2">
                <div className="flex flex-col">
                  <span className="text-panel-title font-semibold text-fg">
                    {COMPONENT_LABEL[c.name] ?? c.name}
                  </span>
                  <span
                    className={`font-body-code text-[11px] ${c.status === 'ok' ? 'text-fg-faint' : 'text-warn'}`}
                  >
                    {COMPONENT_ROLE[c.name] ?? c.name}
                  </span>
                </div>
                <span
                  className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-body-code text-[10px] font-semibold ${status.tone}`}
                >
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[c.status]}`}
                  />
                  {status.label}
                </span>
              </div>
              <dl className="flex flex-col gap-1.5 border-t border-border pt-2 font-body-code text-caption">
                {isDispatcher ? (
                  <>
                    <Row label="Status">{c.status === 'down' ? 'Stopped' : 'Running'}</Row>
                    <Row label="Last Dispatch">
                      {dispatcher?.last_dispatched_at == null
                        ? 'None yet'
                        : `${formatAgo(dispatcher.last_dispatched_at)}${dispatcher.last_dispatched_tool_module == null ? '' : ` (${dispatcher.last_dispatched_tool_module})`}`}
                    </Row>
                    <Row label="Heartbeat" tone={c.status}>
                      {ago(dispatcher?.last_heartbeat_at)}
                    </Row>
                    <Row label="Concurrency" tone="muted">
                      {dispatcher?.running_total == null || dispatcher.slot_capacity == null
                        ? 'Unknown'
                        : `${COUNT.format(dispatcher.running_total)} running / max ${COUNT.format(dispatcher.slot_capacity)}`}
                    </Row>
                  </>
                ) : (
                  <>
                    {endpoint !== undefined && (
                      <Row label="Endpoint">
                        <span title={endpoint}>{endpoint}</span>
                      </Row>
                    )}
                    <Row label="Version">{c.version ?? 'Unknown'}</Row>
                    <Row label="Latency" tone={c.status}>
                      {c.latency_ms === null ? 'No reply' : `${COUNT.format(c.latency_ms)} ms`}
                    </Row>
                    <Row label="Last Check" tone="muted">
                      <span title={formatMoment(c.checked_at)}>{formatMoment(c.checked_at)}</span>
                    </Row>
                  </>
                )}
              </dl>
              {c.status !== 'ok' && c.message != null && (
                <p className="mt-2.5 rounded-sm border border-warn-bd bg-warn-soft p-1.5 font-body-code text-[10.5px] leading-tight text-warn">
                  {c.message}
                </p>
              )}
            </div>
            <div className="mt-space-md flex items-center justify-between gap-1 border-t border-border pt-space-xs">
              {isDispatcher ? (
                <Link
                  href="/queue"
                  className="flex items-center gap-0.5 font-body-code text-[11px] text-primary hover:underline"
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
                    play_arrow
                  </span>
                  Dispatch Now
                </Link>
              ) : settings !== undefined && canConfigure ? (
                <Link
                  href={settings}
                  className="flex items-center gap-0.5 font-body-code text-[11px] text-primary hover:underline"
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
                    tune
                  </span>
                  Settings
                </Link>
              ) : (
                <span className="truncate font-body-code text-[10px] text-fg-faint">
                  {c.detail ?? ''}
                </span>
              )}
              <button
                type="button"
                aria-label={`Recheck ${COMPONENT_LABEL[c.name] ?? c.name}`}
                onClick={() => onRecheck(c.name)}
                disabled={rechecking === c.name}
                className={`rounded-sm border px-2 py-1 font-body-code text-[11px] transition-colors focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 ${RECHECK[c.status]}`}
              >
                Recheck
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
