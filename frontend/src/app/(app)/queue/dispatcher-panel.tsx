'use client';

import type { ReactElement } from 'react';

import { useDispatcherStatus } from '@/lib/dispatcher';
import { formatMoment } from '@/lib/format-moment';
import { useWorkers } from '@/lib/workers';

import { errorText } from '../programs/error-text';
import { shortId } from '../programs/links';
import { ALERT, COUNT, NOTE, PANEL } from '../programs/ui';

const SECTION_LABEL = 'font-label-caps text-label-caps uppercase tracking-wider text-fg-faint';

const RUNNER_TH = 'px-space-md py-1.5 font-label-caps text-label-caps uppercase text-fg-muted';

/** Queued jobs per tool module as bars, the mockup's "by scan type" list (M7). */
function ToolModuleBars({
  counts,
  names,
}: {
  counts: Readonly<Record<string, number>>;
  names: ReadonlyMap<string, string>;
}): ReactElement {
  const rows = Object.entries(counts).sort(([, a], [, b]) => b - a);
  const max = rows.reduce((m, [, c]) => Math.max(m, c), 0);
  return (
    <div className="flex flex-col gap-space-sm">
      <span className={SECTION_LABEL}>By tool module</span>
      {rows.length === 0 ? (
        <p className="text-caption text-fg-muted">Nothing queued.</p>
      ) : (
        <ul className="flex flex-col gap-space-sm">
          {rows.map(([id, count]) => (
            <li key={id} className="flex flex-col gap-1">
              <span className="flex justify-between gap-space-sm font-caption text-caption">
                <span className="truncate font-body-code text-fg">
                  {names.get(id) ?? shortId(id)}
                </span>
                <span className="font-body-code-bold text-primary">
                  {COUNT.format(count)} queued
                </span>
              </span>
              <span
                aria-hidden="true"
                className="h-2 w-full overflow-hidden rounded-sm bg-surface-2"
              >
                <span
                  className="block h-full rounded-sm bg-primary-container"
                  style={{ width: `${max === 0 ? 0 : (count / max) * 100}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Queued jobs per program as tiles, the mockup's "by program" grid (M7). */
function ProgramTiles({
  counts,
  names,
}: {
  counts: Readonly<Record<string, number>>;
  names: ReadonlyMap<string, string>;
}): ReactElement {
  const rows = Object.entries(counts).sort(([, a], [, b]) => b - a);
  return (
    <div className="flex flex-col gap-space-sm border-t border-border pt-space-sm">
      <span className={SECTION_LABEL}>By program</span>
      {rows.length === 0 ? (
        <p className="text-caption text-fg-muted">Nothing queued.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-space-sm sm:grid-cols-2">
          {rows.map(([id, count]) => (
            <li
              key={id}
              className="flex items-center justify-between gap-space-sm rounded-sm border border-border bg-surface-2 p-2"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined text-[16px] text-fg-faint"
                >
                  folder
                </span>
                <span className="truncate font-body-code-bold text-caption text-fg">
                  {names.get(id) ?? shortId(id)}
                </span>
              </span>
              <span className="rounded-sm bg-surface-3 px-1.5 py-0.5 font-body-code-bold text-caption text-primary">
                {COUNT.format(count)} {count === 1 ? 'job' : 'jobs'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PanelHeader({
  icon,
  title,
  subtitle,
  aside,
}: {
  icon: string;
  title: string;
  subtitle: string;
  aside?: string | null;
}): ReactElement {
  return (
    <div className="flex items-center justify-between gap-space-sm border-b border-border pb-space-sm">
      <div className="flex items-center gap-space-sm">
        <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-primary">
          {icon}
        </span>
        <div>
          <h2 className="font-panel-title text-panel-title font-semibold leading-tight text-fg">
            {title}
          </h2>
          <p className="font-body-code text-caption text-fg-faint">{subtitle}</p>
        </div>
      </div>
      {aside != null && <span className="font-body-code text-caption text-fg-muted">{aside}</span>}
    </div>
  );
}

const STATUS_WORD = { ok: 'Healthy', degraded: 'Degraded', down: 'Down' } as const;

const STATUS_PILL = {
  ok: 'border-good-bd bg-good-soft text-good',
  degraded: 'border-warn-bd bg-warn-soft text-warn',
  down: 'border-crit-bd bg-crit-soft text-crit',
} as const;

const STATUS_DOT = { ok: 'bg-good', degraded: 'bg-warn', down: 'bg-crit' } as const;

/** "34.0%" of a part over a whole, or null when either is missing. */
function share(part: number | undefined, whole: number | undefined): number | null {
  if (part === undefined || whole === undefined || whole === 0) return null;
  return (part / whole) * 100;
}

function seconds(value: number | null | undefined): string {
  if (value == null) return '-';
  const total = Math.round(value);
  const m = Math.floor(total / 60);
  return m === 0 ? `${total}s` : `${m}m ${String(total % 60).padStart(2, '0')}s`;
}

function bytes(value: number | null | undefined): string {
  if (value == null) return '-';
  if (value >= 1_048_576) return `${(value / 1_048_576).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${COUNT.format(value)} B`;
}

/** A labelled gauge: Queue Depth Pressure (M23), Worker Fleet Capacity (M24). */
function Gauge({
  label,
  percent,
  suffix,
  left,
  right,
}: {
  label: string;
  percent: number | null;
  suffix: string;
  left: string;
  right: string;
}): ReactElement {
  return (
    <div className="flex flex-col gap-1.5 rounded-sm border border-border bg-surface-2 p-space-sm">
      <div className="flex items-center justify-between gap-space-sm font-caption text-caption">
        <span className="text-fg-muted">{label}</span>
        <span className="font-body-code text-primary">
          {percent === null ? '-' : `${percent.toFixed(1)}% ${suffix}`}
        </span>
      </div>
      <span aria-hidden="true" className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
        <span
          className="block h-full rounded-full bg-primary-container"
          style={{ width: `${Math.min(100, percent ?? 0)}%` }}
        />
      </span>
      <div className="flex items-center justify-between font-body-code text-caption text-fg-faint">
        <span>{left}</span>
        <span>{right}</span>
      </div>
    </div>
  );
}

/** CPU load as the mockup colours it: green, amber past 50%, red past 80%. */
type CpuLevel = 'none' | 'low' | 'mid' | 'high';

const CPU_TONE: Readonly<Record<CpuLevel, string>> = {
  none: 'text-fg-faint',
  low: 'text-good',
  mid: 'text-warn',
  high: 'text-crit',
};

function cpuLevel(value: number | null | undefined): CpuLevel {
  if (value == null) return 'none';
  if (value >= 80) return 'high';
  if (value >= 50) return 'mid';
  return 'low';
}

/** Dispatcher Engine: health, queue and fleet gauges, then the runner nodes. Workers is
 * Superadmin and Admin only, so it is not requested for User. */
export function DispatcherPanel({
  showWorkers,
  version,
  toolModuleNames,
  poll,
}: {
  showWorkers: boolean;
  version: string | null;
  toolModuleNames: ReadonlyMap<string, string>;
  poll: number | false;
}): ReactElement {
  const status = useDispatcherStatus(poll);
  const workers = useWorkers(null, showWorkers);
  const d = status.data;
  const health = d?.status ?? null;
  const online = (workers.data?.items ?? []).filter((w) => w.is_online !== false);

  return (
    <div className={`${PANEL} flex flex-col gap-space-md p-space-lg`}>
      <div className="flex items-center justify-between gap-space-sm border-b border-border pb-space-sm">
        <div className="flex items-center gap-space-sm">
          <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-primary">
            precision_manufacturing
          </span>
          <div>
            <h2 className="font-panel-title text-panel-title font-semibold leading-tight text-fg">
              Dispatcher Engine
            </h2>
            <p className="font-body-code text-caption text-fg-faint">
              {version === null ? 'Dispatcher' : `ReconOS ${version}`} · heartbeat{' '}
              {d?.last_heartbeat_at == null ? 'never' : formatMoment(d.last_heartbeat_at)}
            </p>
          </div>
        </div>
        {health !== null && (
          <span
            className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-label-caps text-label-caps uppercase ${STATUS_PILL[health]}`}
          >
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[health]}`} />
            {STATUS_WORD[health]}
          </span>
        )}
      </div>
      {status.isPending && <p className={NOTE}>Loading the dispatcher status…</p>}
      {status.isError && (
        <p role="alert" className={ALERT}>
          {errorText(status.error, 'Could not load the dispatcher status.')}
        </p>
      )}
      {d !== undefined && (
        <>
          <div className="grid grid-cols-1 gap-space-sm sm:grid-cols-2">
            <Gauge
              label="Queue Depth Pressure"
              percent={share(d.queued_total, d.queue_capacity)}
              suffix="used"
              left={d.queued_total === undefined ? '-' : `${COUNT.format(d.queued_total)} waiting`}
              right={d.queue_capacity === undefined ? '-' : `${COUNT.format(d.queue_capacity)} cap`}
            />
            <Gauge
              label="Worker Fleet Capacity"
              percent={share(d.running_total, d.slot_capacity)}
              suffix="Utl"
              left={
                d.running_total === undefined || d.slot_capacity === undefined
                  ? '-'
                  : `${COUNT.format(d.running_total)} / ${COUNT.format(d.slot_capacity)} slots busy`
              }
              right={
                d.workers_online === undefined
                  ? '-'
                  : `${COUNT.format(d.workers_online)} workers online`
              }
            />
          </div>
          <dl className="grid grid-cols-2 gap-space-sm rounded-sm border border-border bg-surface-2 p-space-sm md:grid-cols-4">
            <div>
              <dt className={SECTION_LABEL}>Throughput</dt>
              <dd className="mt-0.5 font-body-code text-body-code text-fg">
                {d.jobs_per_minute === undefined ? '-' : `~${d.jobs_per_minute.toFixed(1)}/min`}
              </dd>
            </div>
            <div>
              <dt className={SECTION_LABEL}>Job Latency</dt>
              <dd className="mt-0.5 font-body-code text-body-code text-fg">
                {seconds(d.avg_wait_seconds)}
              </dd>
            </div>
            <div>
              <dt className={SECTION_LABEL}>Redis Store</dt>
              <dd className="mt-0.5 font-body-code text-body-code text-good">
                {bytes(d.redis_used_bytes)}
              </dd>
            </div>
            <div>
              <dt className={SECTION_LABEL}>Last Dispatch</dt>
              <dd className="mt-0.5 font-body-code text-caption text-fg-muted">
                {d.last_dispatched_at == null ? 'Never' : formatMoment(d.last_dispatched_at)}
              </dd>
            </div>
          </dl>
        </>
      )}
      {showWorkers && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className={SECTION_LABEL}>Active Runner Nodes</span>
            {workers.data !== undefined && (
              <span className="font-body-code text-caption text-fg-faint">
                {COUNT.format(online.length)} connected
              </span>
            )}
          </div>
          {workers.isPending && <p className="text-caption text-fg-muted">Loading workers…</p>}
          {workers.isError && (
            <p role="alert" className="text-caption text-crit-strong">
              {errorText(workers.error, 'Could not load the workers.')}
            </p>
          )}
          {workers.data !== undefined && workers.data.items.length === 0 && (
            <p className="text-caption text-fg-muted">No worker has registered.</p>
          )}
          {workers.data !== undefined && workers.data.items.length > 0 && (
            <div className="overflow-x-auto rounded-sm border border-border">
              <table className="w-full min-w-[440px] border-collapse text-left font-body-code text-caption">
                <thead className="bg-surface-2">
                  <tr>
                    <th className={RUNNER_TH}>Runner node</th>
                    <th className={RUNNER_TH}>Active module</th>
                    <th className={RUNNER_TH}>Concurrency</th>
                    <th className={`${RUNNER_TH} text-right`}>CPU load</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {workers.data.items.map((w) => (
                    <tr key={w.id}>
                      <td className="px-space-md py-2">
                        <span className="flex items-center gap-1.5 text-fg">
                          <span
                            aria-hidden="true"
                            className={`h-1.5 w-1.5 rounded-full ${w.is_online === false ? 'bg-fg-faint' : 'bg-good'}`}
                          />
                          {w.name}
                          {w.is_online === false && (
                            <span className="text-fg-faint">(offline)</span>
                          )}
                        </span>
                      </td>
                      <td className="px-space-md py-2">
                        <span className="flex flex-wrap gap-1">
                          {(w.running_tool_module_ids ?? []).length === 0 ? (
                            <span className="text-fg-faint">Idle</span>
                          ) : (
                            (w.running_tool_module_ids ?? []).map((id) => (
                              <span
                                key={id}
                                className="rounded-sm bg-surface-3 px-1.5 text-primary"
                              >
                                {toolModuleNames.get(id) ?? shortId(id)}
                              </span>
                            ))
                          )}
                        </span>
                      </td>
                      <td className="px-space-md py-2 text-fg-muted">
                        {w.running_job_count === undefined
                          ? '-'
                          : `${COUNT.format(w.running_job_count)} concurrent`}
                      </td>
                      <td
                        className={`px-space-md py-2 text-right ${CPU_TONE[cpuLevel(w.cpu_percent)]}`}
                      >
                        {w.cpu_percent == null ? '-' : `${Math.round(w.cpu_percent)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Queued jobs by tool module and by program, from the same dispatcher status. */
export function DistributionPanel({
  toolModuleNames,
  programNames,
  poll = false,
}: {
  toolModuleNames: ReadonlyMap<string, string>;
  programNames: ReadonlyMap<string, string>;
  poll?: number | false;
}): ReactElement {
  const status = useDispatcherStatus(poll);
  const queued =
    status.data === undefined
      ? null
      : Object.values(status.data.queued_by_tool_module).reduce((a, b) => a + b, 0);
  return (
    <div className={`${PANEL} flex flex-col gap-space-md p-space-lg`}>
      <PanelHeader
        icon="pie_chart"
        title="Queue Distribution"
        subtitle="Queued jobs waiting for a worker"
        aside={queued === null ? null : `${COUNT.format(queued)} queued`}
      />
      {status.isPending && <p className={NOTE}>Loading…</p>}
      {status.isError && (
        <p role="alert" className={ALERT}>
          {errorText(status.error, 'Could not load the queue distribution.')}
        </p>
      )}
      {status.data !== undefined && (
        <>
          <ToolModuleBars counts={status.data.queued_by_tool_module} names={toolModuleNames} />
          <ProgramTiles counts={status.data.queued_by_program} names={programNames} />
        </>
      )}
    </div>
  );
}
