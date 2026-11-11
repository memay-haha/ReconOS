'use client';

import { type ReactElement, useState } from 'react';

import {
  type Engine,
  SCAN_PRESETS,
  type ScanPreset,
  useEngineWorkflow,
  useEngineWorkflows,
} from '@/lib/engines';
import { formatMoment } from '@/lib/format-moment';
import { useLogs } from '@/lib/logs';
import type { HealthComponent } from '@/lib/system';

import { BUTTON_SECONDARY, Modal } from '../system/modal';
import { loadErrorText } from '../system/states';
import { formatUptime } from './engine-shared';
import { ENGINE_PANEL, PanelTitle } from './panel-title';

const COUNT = new Intl.NumberFormat('en-US');

function StripCell({
  label,
  icon,
  children,
}: {
  label: string;
  icon: string;
  children: ReactElement;
}): ReactElement {
  return (
    <div className="flex items-center justify-between gap-space-sm rounded-sm border border-border bg-surface p-space-md">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-label-caps text-label-caps uppercase text-fg-faint">{label}</span>
        {children}
      </div>
      <span
        aria-hidden="true"
        className="material-symbols-outlined rounded-sm bg-surface-2 p-1.5 text-[20px] text-fg-muted"
      >
        {icon}
      </span>
    </div>
  );
}

/** Engine Status, Gateway Endpoint, Uptime (M35) and API key check (`last_test_ok`). The
 * mockup's key TTL is out: engine keys have no documented expiry. */
export function StatusStrip({
  engine,
  component,
}: {
  engine: Engine;
  component: HealthComponent | undefined;
}): ReactElement {
  const status = component?.status;
  const connected = status === 'ok' || status === 'degraded';
  const version = engine.version ?? null;
  return (
    <div className="grid grid-cols-1 gap-space-md sm:grid-cols-2 xl:grid-cols-4">
      <StripCell label="Engine Status" icon="dns">
        <span
          className={`flex items-center gap-1.5 font-body-code text-body-code ${connected ? 'text-good' : 'text-crit'}`}
        >
          <span
            aria-hidden="true"
            className={`h-2 w-2 rounded-full ${connected ? 'bg-good' : 'bg-crit'}`}
          />
          {status === undefined
            ? 'Unknown'
            : connected
              ? `Connected${version === null ? '' : ` (${version})`}`
              : 'Unreachable'}
        </span>
      </StripCell>
      <StripCell label="Gateway Endpoint" icon="lan">
        <span
          className="truncate font-body-code text-body-code text-primary"
          title={engine.base_url}
        >
          {engine.base_url}
        </span>
      </StripCell>
      <StripCell label="Uptime" icon="schedule">
        <span className="font-stat-lg text-[24px] leading-7 text-fg">
          {engine.uptime_seconds == null ? 'Not ok' : formatUptime(engine.uptime_seconds)}
        </span>
      </StripCell>
      <StripCell label="API Key" icon="key">
        {engine.last_test_ok == null ? (
          <span className="font-body-code text-[11px] text-fg-muted">Not tested yet</span>
        ) : (
          <span className="flex items-center gap-1.5 font-body-code text-[11px] text-fg-faint">
            <span
              className={`rounded-sm border px-1.5 py-0.5 ${engine.last_test_ok ? 'border-good-bd bg-good-soft text-good' : 'border-crit-bd bg-crit-soft text-crit'}`}
            >
              {engine.last_test_ok ? 'Accepted' : 'Rejected'}
            </span>
            {engine.last_tested_at != null && formatMoment(engine.last_tested_at)}
          </span>
        )}
      </StripCell>
    </div>
  );
}

const TIME = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Asia/Ho_Chi_Minh',
});

/** The latest application log lines about calls to this engine (N41). */
export function EventStream({ engine }: { engine: 'osmedeus' | 'vigolium' }): ReactElement {
  const logs = useLogs({ engine, limit: 5 }, null, 30_000);
  return (
    <div className="flex flex-col gap-1 rounded-sm border border-border bg-surface-container-lowest p-space-md font-body-code text-[11px]">
      <div className="flex items-center justify-between">
        <span className="font-label-caps uppercase text-fg-faint">Engine Event Stream</span>
        <span className={logs.isError ? 'text-crit' : 'text-good'}>
          {logs.isError ? 'UNAVAILABLE' : 'LIVE'}
        </span>
      </div>
      {logs.data?.items.length === 0 && <p className="text-fg-faint">No engine calls logged.</p>}
      {logs.data?.items.map((row) => (
        <p key={row.id} className={row.level === 'info' ? 'text-fg-muted' : 'text-warn'}>
          [{TIME.format(new Date(row.logged_at))}] {row.event}
        </p>
      ))}
    </div>
  );
}

/** Queue saturation: running jobs over the summed `max_concurrency` of the engine's enabled
 * tool modules (M24). Daemon memory is out: Osmedeus exposes no metrics endpoint (D3-B). */
export function ResourceOverhead({ engine }: { engine: Engine }): ReactElement {
  const used = engine.slots_used ?? null;
  const total = engine.slots_total ?? null;
  const ratio = used === null || total === null || total === 0 ? null : used / total;
  const percent = ratio === null ? null : Math.round(Math.min(ratio, 1) * 1000) / 10;
  return (
    <section aria-label="Resource overhead" className={ENGINE_PANEL}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="h-3.5 w-1.5 rounded-full bg-good" />
          <h3 className="text-panel-title text-fg">Cluster Resource Overhead</h3>
        </div>
        <span className="font-body-code text-[11px] text-good">
          {percent !== null && percent >= 90 ? 'Saturated' : 'Optimal'}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-caption text-fg-muted">
          <span>
            {used === null || total === null
              ? 'Queue Saturation'
              : `Queue Saturation (${COUNT.format(used)} / ${COUNT.format(total)} Slots)`}
          </span>
          <span className="font-body-code text-fg">{percent === null ? '-' : `${percent}%`}</span>
        </div>
        <span
          role="meter"
          aria-label="Queue saturation"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent ?? 0}
          className="h-1.5 overflow-hidden rounded-full bg-surface-2"
        >
          {/* A runtime width has no Tailwind class; style carries no colour. */}
          <span className="block h-full bg-primary" style={{ width: `${percent ?? 0}%` }} />
        </span>
      </div>
    </section>
  );
}

const PRESET: Readonly<
  Record<ScanPreset, { label: string; icon: string; tone: string; text: string }>
> = {
  quick: {
    label: 'Quick',
    icon: 'bolt',
    tone: 'text-good',
    text: 'Fast discovery with a minimal footprint: fewer threads, short timeouts, top ports.',
  },
  balanced: {
    label: 'Balanced',
    icon: 'tune',
    tone: 'text-primary',
    text: 'Standard reconnaissance combining passive feeds and active enumeration.',
  },
  deep: {
    label: 'Deep',
    icon: 'radar',
    tone: 'text-warn',
    text: 'Exhaustive attack-surface discovery, including full port spans and brute forcing.',
  },
};

/** `engine.settings.scan_preset` (D3-B). The run parameters each preset maps to are still being
 * verified on Osmedeus (tech-debt 8), so the cards name the intent, not numbers. */
export function ScanTactics({
  value,
  onChange,
}: {
  value: ScanPreset;
  onChange: (preset: ScanPreset) => void;
}): ReactElement {
  return (
    <section id="scan-tactics" aria-label="Scan tactics" className={`${ENGINE_PANEL} scroll-mt-20`}>
      <PanelTitle
        bar="primary"
        title="Scan Tactics & Intensity Presets"
        subtitle="Default intensity applied to new Osmedeus runs. Saved with Save Changes."
      >
        <span className="font-label-caps text-label-caps uppercase text-fg-muted">
          Active: {PRESET[value].label}
        </span>
      </PanelTitle>
      <div className="grid grid-cols-1 gap-space-md md:grid-cols-3">
        {SCAN_PRESETS.map((preset) => {
          const card = PRESET[preset];
          const active = preset === value;
          return (
            <div
              key={preset}
              className={`relative flex flex-col justify-between gap-space-md rounded-sm border bg-surface-2 p-space-md ${active ? 'border-primary-container' : 'border-border'}`}
            >
              {preset === 'balanced' && (
                <span className="absolute -top-2.5 right-3 rounded-sm bg-primary-container px-1.5 font-body-code text-[10px] text-accent-ink">
                  DEFAULT
                </span>
              )}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className={`font-body-code-bold text-body-code-bold ${card.tone}`}>
                    {card.label}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`material-symbols-outlined text-[18px] ${card.tone}`}
                  >
                    {card.icon}
                  </span>
                </div>
                <p className="text-caption text-fg-muted">{card.text}</p>
              </div>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onChange(preset)}
                className={`h-8 rounded-sm font-label-caps text-[11px] uppercase focus:outline-none focus:ring-2 focus:ring-ring ${active ? 'bg-primary-container font-semibold text-accent-ink' : 'border border-border bg-surface text-fg-muted hover:text-fg'}`}
              >
                {active ? 'Active Profile' : `Select ${card.label}`}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const HEAD = 'px-space-md py-2 font-label-caps text-label-caps uppercase text-fg-muted';
const CELL = 'px-space-md py-2.5';

function WorkflowGraph({
  engineId,
  name,
  onClose,
}: {
  engineId: string;
  name: string;
  onClose: () => void;
}): ReactElement {
  const detail = useEngineWorkflow(engineId, name);
  return (
    <Modal title={`Workflow ${name}`} busy={false} wide onClose={onClose}>
      <div className="flex flex-col gap-space-md">
        {detail.isPending && <p className="text-body-default text-fg-muted">Loading steps…</p>}
        {detail.isError && (
          <p role="alert" className="text-body-default text-crit">
            {loadErrorText(detail.error, 'workflow')}
          </p>
        )}
        {detail.data !== undefined && (
          <ol className="flex flex-col gap-1.5 font-body-code text-body-code">
            {detail.data.steps.map((step, i) => (
              <li key={`${step.name}-${i}`} className="flex gap-space-sm">
                <span className="text-fg-faint">{String(i + 1).padStart(2, '0')}</span>
                <span className="text-fg">{step.name}</span>
                {step.description !== null && (
                  <span className="text-fg-muted">{step.description}</span>
                )}
              </li>
            ))}
          </ol>
        )}
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className={BUTTON_SECONDARY}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Workflows installed on Osmedeus, read live through the engine's REST (D3-B). The mockup's
 * folder path and Open Folder are out: no server path leaves the backend. */
export function WorkflowsPanel({ engine }: { engine: Engine }): ReactElement {
  const workflows = useEngineWorkflows(engine.id);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const items = workflows.data?.items ?? [];
  const needle = q.trim().toLowerCase();
  const shown =
    needle === ''
      ? items
      : items.filter((w) =>
          [w.name, w.kind, w.description ?? '', ...w.tags].some((t) =>
            t.toLowerCase().includes(needle),
          ),
        );
  const total = workflows.data?.total;

  return (
    <section
      id="workflows"
      aria-label="Installed workflows"
      className={`${ENGINE_PANEL} scroll-mt-20`}
    >
      <PanelTitle
        bar="primary"
        title={
          total === undefined
            ? 'Installed Workflows Index'
            : `Installed Workflows Index (${COUNT.format(total)} Total)`
        }
        subtitle="Flows and modules installed on the Osmedeus engine, read live from its REST API."
      >
        <label className="relative flex items-center">
          <span className="sr-only">Filter workflows</span>
          <span
            aria-hidden="true"
            className="material-symbols-outlined pointer-events-none absolute left-2 text-[16px] text-fg-faint"
          >
            filter_list
          </span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter workflows..."
            className="h-8 w-56 rounded-sm border border-border bg-surface-2 pl-8 pr-2 font-body-code text-body-code text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none"
          />
        </label>
      </PanelTitle>
      {workflows.isPending && <p className="text-body-default text-fg-muted">Loading workflows…</p>}
      {workflows.isError && (
        <p role="alert" className="text-body-default text-crit">
          {loadErrorText(workflows.error, 'workflow list')}
        </p>
      )}
      {workflows.data !== undefined && (
        <div className="overflow-x-auto rounded-sm border border-border" tabIndex={0}>
          <table className="w-full border-collapse text-left text-body-default">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th scope="col" className={HEAD}>
                  Workflow Name
                </th>
                <th scope="col" className={HEAD}>
                  Type
                </th>
                <th scope="col" className={HEAD}>
                  Steps
                </th>
                <th scope="col" className={HEAD}>
                  Description
                </th>
                <th scope="col" className={HEAD}>
                  Tags
                </th>
                <th scope="col" className={`${HEAD} text-right`}>
                  Inspect
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.map((w) => (
                <tr key={w.name} className="hover:bg-surface-2">
                  <td className={`${CELL} font-body-code text-body-code text-primary`}>{w.name}</td>
                  <td className={CELL}>
                    <span
                      className={`rounded-sm px-1.5 py-0.5 font-body-code text-[10px] uppercase ${w.kind === 'flow' ? 'bg-surface-3 text-fg' : 'bg-good-soft text-good'}`}
                    >
                      {w.kind}
                    </span>
                  </td>
                  <td className={`${CELL} whitespace-nowrap font-body-code text-fg`}>
                    {w.step_count === null ? '-' : `${COUNT.format(w.step_count)} steps`}
                  </td>
                  <td className={`${CELL} text-fg-muted`}>{w.description ?? ''}</td>
                  <td className={CELL}>
                    <span className="flex flex-wrap gap-1">
                      {w.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-sm border border-border bg-surface-2 px-1.5 font-body-code text-[10px] text-fg-faint"
                        >
                          {tag}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className={`${CELL} text-right`}>
                    <button
                      type="button"
                      aria-label={`View graph of ${w.name}`}
                      onClick={() => setOpen(w.name)}
                      className="rounded-sm p-1 text-fg-muted hover:bg-surface-3 hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                        visibility
                      </span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && (
            <p className="px-space-md py-space-lg text-body-default text-fg-muted">
              No workflows match.
            </p>
          )}
        </div>
      )}
      {workflows.data !== undefined && (
        <p className="font-body-code text-caption text-fg-faint">
          Displaying {COUNT.format(shown.length)} of {COUNT.format(items.length)} workflows.
        </p>
      )}
      {open !== null && (
        <WorkflowGraph engineId={engine.id} name={open} onClose={() => setOpen(null)} />
      )}
    </section>
  );
}
