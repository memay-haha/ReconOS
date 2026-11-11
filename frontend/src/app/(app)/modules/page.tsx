'use client';

import Link from 'next/link';
import { type ReactElement, useEffect, useState } from 'react';

import { Pagination, useCursorStack } from '@/components/pagination';
import { useMe } from '@/lib/auth';
import { versionLabel } from '@/lib/build-info';
import { useDispatcherStatus } from '@/lib/dispatcher';
import {
  TOOL_GROUPS,
  type ToolGroup,
  type ToolModuleRow,
  usePatchToolModule,
  useToolModules,
  useToolModuleStats,
} from '@/lib/tool-modules';

import { ALERT_TEXT, PANEL, STATE_TEXT } from '../system/modal';
import { loadErrorText, saveErrorText } from '../system/states';
import { DispatchDialog } from './dispatch-dialog';
import { engineName } from './module-bits';
import { ModuleCards } from './module-cards';
import { ModuleForm } from './module-form';
import { ModuleTable } from './module-table';
import { GROUP_LABEL, KPI_FOOT, KPI_LABEL, KPI_TILE } from './tones';

const COUNT = new Intl.NumberFormat('en-US');
const VERSION = versionLabel();
const PERCENT = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 });

type View = 'grid' | 'table';

const PAGER_TABLE = 'border-t border-border bg-surface-2 px-space-md';
const PAGER_GRID = 'mt-space-md rounded-sm border border-border bg-surface-2 px-space-md';

const SWITCH = 'flex items-center gap-1 rounded-sm px-2.5 py-1 text-body-code font-semibold';
const SWITCH_ON = `${SWITCH} border border-border-strong bg-surface text-primary`;
const SWITCH_OFF = `${SWITCH} border border-transparent text-fg-muted hover:bg-surface-3 hover:text-fg`;

const PILL = 'whitespace-nowrap rounded-sm px-2.5 py-1 text-label-caps uppercase';
const PILL_ON = `${PILL} border border-border-strong bg-surface text-primary`;
const PILL_OFF = `${PILL} border border-transparent text-fg-muted hover:bg-surface-3 hover:text-fg`;

const CROSS_LINK =
  'flex items-center gap-1.5 rounded-sm border border-border-strong bg-surface-2 px-2.5 py-1.5 font-body-code text-body-code text-fg-muted hover:bg-surface-3 hover:text-fg focus:outline-none focus:ring-2 focus:ring-ring';

const CHIP = 'flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-body-code text-caption';
/** The dispatcher pill follows `status` from `GET /dispatcher/status`; the backend computes it. */
type DispatcherState = 'ok' | 'degraded' | 'down';
const DISPATCHER_TONE: Readonly<Record<DispatcherState, string>> = {
  ok: `${CHIP} border-good-bd bg-good-soft text-good`,
  degraded: `${CHIP} border-warn-bd bg-warn-soft text-warn`,
  down: `${CHIP} border-crit-bd bg-crit-soft text-crit`,
};
const DISPATCHER_DOT: Readonly<Record<DispatcherState, string>> = {
  ok: 'bg-good',
  degraded: 'bg-warn',
  down: 'bg-crit',
};
const DISPATCHER_LABEL: Readonly<Record<DispatcherState, string>> = {
  ok: 'Dispatcher Synced',
  degraded: 'Dispatcher Degraded',
  down: 'Dispatcher Down',
};

const TOP_BAR = {
  primary: 'absolute inset-x-0 top-0 h-[3px] bg-primary',
  good: 'absolute inset-x-0 top-0 h-[3px] bg-good',
  info: 'absolute inset-x-0 top-0 h-[3px] bg-info',
  warn: 'absolute inset-x-0 top-0 h-[3px] bg-warn',
} as const;

function byGroup(modules: readonly ToolModuleRow[]): ToolModuleRow[] {
  return [...modules].sort(
    (a, b) =>
      TOOL_GROUPS.indexOf(a.group) - TOOL_GROUPS.indexOf(b.group) || a.name.localeCompare(b.name),
  );
}

function Icon({ name }: { name: string }): ReactElement {
  return (
    <span aria-hidden="true" className="material-symbols-outlined text-icon">
      {name}
    </span>
  );
}

type Open = { mode: 'configure' | 'run'; module: ToolModuleRow } | null;

/** S18. Every role reads the list and may run a tool module; only a Superadmin changes one. */
export default function ModulesPage(): ReactElement {
  const me = useMe();
  const role = me.data?.role;
  const isSuperadmin = role === 'superadmin';
  const { cursor, canGoBack, goNext, goBack, reset } = useCursorStack();
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<ToolGroup | null>(null);
  const [engine, setEngine] = useState('');
  const [showDisabled, setShowDisabled] = useState(true);
  // The unfiltered catalog feeds the tiles and the engine choices; the filtered list feeds the
  // cards. With no filter both share one query key, so one request serves both.
  const catalog = useToolModules();
  const modules = useToolModules(cursor, {
    q: q.trim() === '' ? null : q.trim(),
    group,
    runsOn: engine === '' ? null : engine,
    isEnabled: showDisabled ? null : true,
  });
  const stats = useToolModuleStats('24h');
  const dispatcher = useDispatcherStatus();
  const toggle = usePatchToolModule();
  const [open, setOpen] = useState<Open>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [view, setView] = useState<View>('grid');

  useEffect(() => {
    if (toast === null) return undefined;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  const refilter = () => reset();
  const run = (m: ToolModuleRow) => setOpen({ mode: 'run', module: m });
  const flip = (m: ToolModuleRow) =>
    toggle.mutate({ toolModuleId: m.id, body: { is_enabled: !m.is_enabled } });
  const refresh = () => {
    void catalog.refetch();
    void modules.refetch();
    void stats.refetch();
  };

  const all = catalog.data;
  const engines = [
    ...new Set((all?.items ?? []).flatMap((m) => (m.runs_on === null ? [] : [m.runs_on]))),
  ].sort();
  const ready =
    all === undefined || all.total === 0
      ? null
      : all.items.filter((m) => m.disabled_reason === null).length / all.total;
  const change =
    stats.data === undefined || stats.data.jobs_prev === 0
      ? null
      : (stats.data.jobs - stats.data.jobs_prev) / stats.data.jobs_prev;
  const chip = dispatcher.data?.status;
  const handlers = {
    isSuperadmin,
    busy: toggle.isPending,
    onToggle: flip,
    onConfigure: (m: ToolModuleRow) => setOpen({ mode: 'configure', module: m }),
    onRun: run,
  };

  return (
    <div className="flex w-full flex-col gap-space-lg">
      <div className="flex flex-col justify-between gap-space-md pt-space-xs lg:flex-row lg:items-center">
        <div className="flex flex-col gap-space-xs">
          <div className="flex flex-wrap items-center gap-space-sm">
            <h1 className="text-headline-lg tracking-tight text-fg">Modules</h1>
            {VERSION !== null && (
              <span className="rounded-sm border border-accent-soft-bd bg-accent-soft px-space-xs py-0.5 font-body-code text-caption text-primary">
                {VERSION}
              </span>
            )}
            {chip !== undefined && (
              <span className={DISPATCHER_TONE[chip]}>
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full ${DISPATCHER_DOT[chip]}`}
                />
                {DISPATCHER_LABEL[chip]}
              </span>
            )}
          </div>
          <p className="max-w-3xl text-body-default text-fg-muted">
            One card per tool module, with the engine it runs on. Run now creates a job in the
            Queue; Exploit jobs wait for approval by an Admin who did not create them.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-space-sm">
          <div
            role="group"
            aria-label="View"
            className="flex items-center rounded-sm border border-border bg-surface-2 p-0.5"
          >
            {(
              [
                ['grid', 'grid_view', 'Grid'],
                ['table', 'table_rows', 'Table'],
              ] as const
            ).map(([value, icon, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={view === value}
                onClick={() => setView(value)}
                className={view === value ? SWITCH_ON : SWITCH_OFF}
              >
                <Icon name={icon} />
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={refresh}
            className="flex items-center gap-1.5 rounded-sm border border-border-strong bg-surface px-3 py-1.5 text-label-caps uppercase text-fg-muted hover:bg-surface-2 hover:text-fg focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <Icon name="sync" />
            Refresh Index
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-space-md sm:grid-cols-2 xl:grid-cols-4">
        <section aria-label="Modules" className={KPI_TILE}>
          <div className={TOP_BAR.primary} />
          <div className="flex items-start justify-between">
            <span className={KPI_LABEL}>Modules</span>
            <span aria-hidden="true" className="material-symbols-outlined text-icon text-primary">
              terminal
            </span>
          </div>
          <p className="mt-space-sm text-stat-lg tracking-tight text-fg">
            {all === undefined ? '-' : COUNT.format(all.total)}{' '}
            <span className="text-caption text-fg-muted">total</span>
          </p>
          <div className={KPI_FOOT}>
            <span>Tool modules in the catalog</span>
            {VERSION !== null && <span className="font-body-code text-primary">{VERSION}</span>}
          </div>
        </section>
        <section aria-label="Enabled" className={KPI_TILE}>
          <div className={TOP_BAR.good} />
          <div className="flex items-start justify-between">
            <span className={KPI_LABEL}>Enabled</span>
            <span aria-hidden="true" className="material-symbols-outlined text-icon text-good">
              check_circle
            </span>
          </div>
          <div className="mt-space-sm flex items-baseline justify-between gap-space-sm">
            <p className="text-stat-lg tracking-tight text-good">
              {all === undefined ? '-' : COUNT.format(all.enabled_count)}{' '}
              <span className="text-caption text-fg-muted">active</span>
            </p>
            {all !== undefined && (
              <span className="rounded-sm border border-crit-bd bg-crit-soft px-1.5 py-0.5 font-body-code text-caption text-crit">
                {COUNT.format(all.disabled_count)} disabled
              </span>
            )}
          </div>
          <div className={KPI_FOOT}>
            <span className="truncate">
              {all === undefined || all.disabled_names.length === 0
                ? 'No tool module disabled'
                : `Disabled: ${all.disabled_names.join(', ')}`}
            </span>
            {ready !== null && (
              <span className="shrink-0 font-body-code text-fg-faint">
                {PERCENT.format(ready)} ready
              </span>
            )}
          </div>
        </section>
        <section aria-label="Engines" className={KPI_TILE}>
          <div className={TOP_BAR.info} />
          <div className="flex items-start justify-between">
            <span className={KPI_LABEL}>Engines</span>
            <span aria-hidden="true" className="material-symbols-outlined text-icon text-info">
              hub
            </span>
          </div>
          <div className="mt-space-sm flex items-baseline justify-between gap-space-sm">
            <p className="text-stat-lg tracking-tight text-fg">
              {all === undefined ? '-' : COUNT.format(all.engines_bound)}{' '}
              <span className="text-caption text-fg-muted">bound</span>
            </p>
            <span aria-hidden="true" className="flex -space-x-1">
              {engines.map((e) => (
                <span
                  key={e}
                  title={engineName(e)}
                  className="flex h-4 w-4 items-center justify-center rounded-full border border-border bg-surface-3 text-micro font-bold text-info"
                >
                  {engineName(e).charAt(0)}
                </span>
              ))}
            </span>
          </div>
          <div className={KPI_FOOT}>
            <span className="truncate">
              {engines.length === 0 ? 'No engine in use' : engines.map(engineName).join(', ')}
            </span>
            {isSuperadmin && (
              <Link href="/system" className="shrink-0 font-body-code text-info hover:underline">
                Bindings →
              </Link>
            )}
          </div>
        </section>
        <section aria-label="Jobs in 24 hours" className={KPI_TILE}>
          <div className={TOP_BAR.warn} />
          <div className="flex items-start justify-between">
            <span className={KPI_LABEL}>Jobs (24h)</span>
            <span aria-hidden="true" className="material-symbols-outlined text-icon text-warn">
              dynamic_feed
            </span>
          </div>
          <div className="mt-space-sm flex items-baseline justify-between gap-space-sm">
            <p className="text-stat-lg tracking-tight text-warn">
              {stats.data === undefined ? '-' : COUNT.format(stats.data.jobs)}{' '}
              <span className="text-caption text-fg-muted">run</span>
            </p>
            {change !== null && (
              <span
                className={
                  change >= 0
                    ? 'flex items-center font-body-code text-caption text-good'
                    : 'flex items-center font-body-code text-caption text-crit'
                }
                title="Against the 24 hours before"
              >
                <Icon name={change >= 0 ? 'arrow_upward' : 'arrow_downward'} />
                {PERCENT.format(Math.abs(change))}
              </span>
            )}
          </div>
          <div className={KPI_FOOT}>
            <Link
              href="/queue"
              className="flex items-center gap-1 font-body-code text-primary hover:underline"
            >
              Open Queue
              <Icon name="open_in_new" />
            </Link>
            <span className="font-body-code text-fg-faint">
              {stats.data === undefined ? '-' : COUNT.format(stats.data.stalled)} stalled
            </span>
          </div>
        </section>
      </div>
      {stats.isError && (
        <p role="alert" className="text-body-default text-crit">
          {loadErrorText(stats.error, 'job counts')}
        </p>
      )}

      <div className="flex flex-col items-stretch justify-between gap-space-md rounded-sm border border-border bg-surface p-space-md xl:flex-row xl:items-center">
        <div className="flex flex-1 flex-col items-stretch gap-space-md md:flex-row md:items-center">
          <div className="relative w-full md:w-72 md:shrink-0">
            <span
              aria-hidden="true"
              className="material-symbols-outlined pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-icon text-fg-faint"
            >
              filter_alt
            </span>
            <input
              type="text"
              aria-label="Filter tool modules"
              placeholder="Filter by name, capability, description..."
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                refilter();
              }}
              className="w-full rounded-sm border border-border-strong bg-surface-2 py-1.5 pl-8 pr-8 font-body-code text-body-code text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {q !== '' && (
              <button
                type="button"
                aria-label="Clear the filter"
                onClick={() => {
                  setQ('');
                  refilter();
                }}
                className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center text-fg-faint hover:text-fg focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <Icon name="close" />
              </button>
            )}
          </div>
          <div
            role="group"
            aria-label="Group"
            className="flex items-center overflow-x-auto rounded-sm border border-border bg-surface-2 p-0.5"
          >
            <button
              type="button"
              aria-pressed={group === null}
              onClick={() => {
                setGroup(null);
                refilter();
              }}
              className={group === null ? PILL_ON : PILL_OFF}
            >
              All ({all === undefined ? '-' : COUNT.format(all.total)})
            </button>
            {TOOL_GROUPS.map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={group === g}
                onClick={() => {
                  setGroup(g);
                  refilter();
                }}
                className={group === g ? PILL_ON : PILL_OFF}
              >
                {GROUP_LABEL[g]} ({all === undefined ? '-' : COUNT.format(all.group_counts[g])})
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-space-lg border-t border-border pt-2 md:justify-end xl:border-t-0 xl:pt-0">
          <label className="flex items-center gap-2 text-label-caps uppercase text-fg-faint">
            Engine:
            <select
              value={engine}
              onChange={(e) => {
                setEngine(e.target.value);
                refilter();
              }}
              className="rounded-sm border border-border-strong bg-surface-2 px-2.5 py-1.5 font-body-code text-body-code normal-case text-fg focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All Engines ({COUNT.format(engines.length)})</option>
              {engines.map((e) => (
                <option key={e} value={e}>
                  {engineName(e)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex cursor-pointer items-center gap-2.5 text-label-caps uppercase text-fg-faint">
            Show Disabled
            <input
              type="checkbox"
              role="switch"
              checked={showDisabled}
              onChange={(e) => {
                setShowDisabled(e.target.checked);
                refilter();
              }}
              className="relative h-4 w-8 shrink-0 cursor-pointer appearance-none rounded-full border border-border-strong bg-surface-2 before:absolute before:left-0.5 before:top-0.5 before:h-2.5 before:w-2.5 before:rounded-full before:bg-fg-muted before:transition-transform checked:border-primary-container checked:bg-primary-container checked:before:translate-x-4 checked:before:bg-accent-ink focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        </div>
      </div>

      {toggle.isError && (
        <p role="alert" className="text-body-default text-crit">
          {saveErrorText(toggle.error)}
        </p>
      )}

      {/* The grid draws its own cards; only the table sits in a panel. */}
      <div className={view === 'grid' ? 'w-full' : PANEL}>
        {modules.isPending && <p className={STATE_TEXT}>Loading the tool modules…</p>}
        {modules.isError && (
          <p role="alert" className={ALERT_TEXT}>
            {loadErrorText(modules.error, 'tool module list')}
          </p>
        )}
        {modules.data !== undefined && (
          <>
            {modules.data.items.length === 0 ? (
              <p className={STATE_TEXT}>No tool module matches.</p>
            ) : view === 'grid' ? (
              <ModuleCards modules={byGroup(modules.data.items)} {...handlers} />
            ) : (
              <ModuleTable modules={byGroup(modules.data.items)} {...handlers} />
            )}
            <div className={view === 'grid' ? PAGER_GRID : PAGER_TABLE}>
              <Pagination
                label="Tool module pagination"
                page={{
                  total: modules.data.total,
                  totalIsEstimate: modules.data.total_is_estimate,
                  nextCursor: modules.data.next_cursor,
                }}
                shown={modules.data.items.length}
                noun="tool modules"
                canGoBack={canGoBack}
                onBack={goBack}
                onNext={() => goNext(modules.data.next_cursor)}
              />
            </div>
          </>
        )}
      </div>

      <div className="flex flex-col items-center justify-between gap-space-md rounded-sm border border-border bg-surface p-space-md md:flex-row">
        <div className="flex items-center gap-space-sm">
          <span
            aria-hidden="true"
            className="material-symbols-outlined flex h-8 w-8 items-center justify-center rounded-sm border border-border bg-surface-2 text-icon text-primary"
          >
            build
          </span>
          <div>
            <p className="text-panel-title font-semibold text-fg">
              Engine &amp; Dependency Diagnostics
            </p>
            <p className="text-caption text-fg-faint">
              Check that tools are installed and engines answer before dispatching batch scans.
            </p>
          </div>
        </div>
        {(role === 'superadmin' || role === 'admin') && (
          <div className="flex flex-wrap items-center gap-space-sm">
            <Link href="/system" className={CROSS_LINK}>
              <span aria-hidden="true" className="material-symbols-outlined text-icon text-good">
                check
              </span>
              Health &amp; Tools: Installed (
              {all === undefined
                ? '-'
                : `${COUNT.format(all.installed_count)}/${COUNT.format(all.total)}`}
              )
            </Link>
            {isSuperadmin && (
              <>
                <Link href="/osmedeus" className={CROSS_LINK}>
                  <span
                    aria-hidden="true"
                    className="material-symbols-outlined text-icon text-primary"
                  >
                    radar
                  </span>
                  Osmedeus Settings
                </Link>
                <Link href="/vigolium" className={CROSS_LINK}>
                  <span
                    aria-hidden="true"
                    className="material-symbols-outlined text-icon text-info"
                  >
                    security
                  </span>
                  Vigolium Settings
                </Link>
              </>
            )}
          </div>
        )}
      </div>

      {open?.mode === 'configure' && (
        <ModuleForm
          module={open.module}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null);
            setToast(`Configuration of ${open.module.name} saved.`);
          }}
        />
      )}
      {open?.mode === 'run' && (
        <DispatchDialog
          module={open.module}
          onClose={() => setOpen(null)}
          onDone={() => {
            setOpen(null);
            setToast(`Job created for ${open.module.name}.`);
          }}
        />
      )}
      {toast !== null && (
        <p
          role="status"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-sm border border-good-bd bg-surface px-4 py-2.5 font-body-code text-body-code text-good shadow-modal"
        >
          <Icon name="task_alt" />
          {toast}
        </p>
      )}
    </div>
  );
}
