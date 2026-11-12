'use client';

import { type ReactElement, useRef, useState } from 'react';

import { useMe } from '@/lib/auth';
import { useRunDiagnostics } from '@/lib/diagnostics';
import { useDispatcherStatus } from '@/lib/dispatcher';
import { useEngines } from '@/lib/engines';
import { HEALTH_POLL_MS, useRecheckComponent, useSystemHealth } from '@/lib/system';
import { useTools } from '@/lib/tools';

import { DiagnosticBanner, DiagnosticsDialog } from './diagnostics';
import { HealthCards, HealthTiles } from './health-cards';
import { LogPanel } from './log-panel';
import { ALERT_TEXT, STATE_TEXT } from './modal';
import { SettingsPanel } from './settings-panel';
import { loadErrorText, NoAccess } from './states';
import { ToolsSection } from './tools-section';

type View = 'services' | 'tools';

const SEGMENT =
  'rounded-sm px-space-md py-1 font-label-caps text-caption uppercase transition-colors';
const SEGMENT_ON = `${SEGMENT} bg-surface-3 text-primary shadow-sm`;
const SEGMENT_OFF = `${SEGMENT} text-fg-muted hover:text-fg`;
const ACTION =
  'flex h-9 items-center gap-1.5 rounded-sm px-space-md font-label-caps text-caption uppercase transition-colors focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60';

function SectionTitle({
  icon,
  title,
  aside,
}: {
  icon: string;
  title: string;
  aside?: string;
}): ReactElement {
  return (
    <div className="flex items-center justify-between gap-space-sm border-b border-border pb-space-sm">
      <div className="flex items-center gap-space-sm">
        <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-primary">
          {icon}
        </span>
        <h2 className="text-panel-title tracking-tight text-fg">{title}</h2>
      </div>
      {aside !== undefined && (
        <span className="font-body-code text-caption text-fg-faint">{aside}</span>
      )}
    </div>
  );
}

/** S15. Superadmin and Admin read it; thresholds and log deletion are Superadmin only. */
export default function SystemPage(): ReactElement {
  const me = useMe();
  const role = me.data?.role;
  const allowed = role === 'superadmin' || role === 'admin';
  const isSuperadmin = role === 'superadmin';
  const [view, setView] = useState<View>('services');
  const [openRun, setOpenRun] = useState<string | null>(null);
  const servicesRef = useRef<HTMLElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const health = useSystemHealth(allowed, HEALTH_POLL_MS);
  const recheck = useRecheckComponent();
  const dispatcher = useDispatcherStatus(allowed ? HEALTH_POLL_MS : false, allowed);
  // Engine endpoints are a Superadmin read (N40).
  const engines = useEngines(isSuperadmin);
  const tools = useTools(allowed);
  const runDiagnostics = useRunDiagnostics();

  if (me.data !== undefined && !allowed) return <NoAccess what="System Health" />;

  const show = (next: View) => {
    setView(next);
    // Both sections stay on screen, as the mockup draws them; the toggle scrolls.
    (next === 'services' ? servicesRef.current : toolsRef.current)?.scrollIntoView?.({
      behavior: 'smooth',
    });
  };
  const endpoints = Object.fromEntries(
    (engines.data?.items ?? []).map((engine) => [engine.name, engine.base_url]),
  );
  const missing =
    tools.data === undefined
      ? null
      : tools.data.items.filter((t) => t.status === 'missing').map((t) => t.name);
  const pollSeconds = HEALTH_POLL_MS / 1000;

  return (
    <div className="flex w-full flex-col gap-space-lg">
      <div className="flex flex-col justify-between gap-space-md lg:flex-row lg:items-center">
        <div className="flex flex-col">
          <div className="mb-1 flex items-center gap-space-sm">
            <h1 className="font-headline-lg text-headline-lg tracking-tight text-fg">
              System Health
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface-2 px-2 py-0.5 font-body-code text-caption text-fg-muted">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-good" />
              <span>TICK {pollSeconds}s</span>
            </span>
          </div>
          <p className="font-body-default text-body-default text-fg-muted">
            Stack components and scanning tools. Telemetry auto-refreshes every {pollSeconds}s.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-space-sm">
          <div className="flex items-center rounded-sm border border-border bg-surface-2 p-0.5">
            <button
              type="button"
              aria-pressed={view === 'services'}
              onClick={() => show('services')}
              className={view === 'services' ? SEGMENT_ON : SEGMENT_OFF}
            >
              Services
            </button>
            <button
              type="button"
              aria-pressed={view === 'tools'}
              onClick={() => show('tools')}
              className={view === 'tools' ? SEGMENT_ON : SEGMENT_OFF}
            >
              Tools
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              void health.refetch();
              void tools.refetch();
              void dispatcher.refetch();
            }}
            disabled={health.isFetching}
            className={`${ACTION} border border-border bg-surface text-fg hover:bg-surface-2`}
          >
            <span
              aria-hidden="true"
              className={`material-symbols-outlined text-[17px] text-fg-muted ${health.isFetching ? 'animate-spin' : ''}`}
            >
              refresh
            </span>
            <span>Refresh</span>
          </button>
          <button
            type="button"
            disabled={!allowed || runDiagnostics.isPending}
            onClick={() =>
              runDiagnostics.mutate(undefined, { onSuccess: (run) => setOpenRun(run.id) })
            }
            className={`${ACTION} bg-primary-container font-semibold tracking-wider text-accent-ink shadow-sm hover:bg-accent-hover`}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
              vital_signs
            </span>
            <span>Run Diagnostics</span>
          </button>
        </div>
      </div>
      {runDiagnostics.isError && (
        <p role="alert" className="text-body-default text-crit">
          Could not start the diagnostic. Try again later.
        </p>
      )}

      <HealthTiles
        components={health.data?.components}
        workersOnline={health.isError ? null : health.data?.workers_online}
        queueLength={health.isError ? null : health.data?.queue_length}
        tools={
          health.isError
            ? null
            : health.data === undefined
              ? undefined
              : (health.data.tools_installed ?? null)
        }
        missingTools={missing}
        fleetLoad={health.data?.fleet_load}
      />

      <DiagnosticBanner enabled={allowed} onView={setOpenRun} />

      <section
        ref={servicesRef}
        aria-label="Core services"
        className="flex scroll-mt-20 flex-col gap-space-md"
      >
        <SectionTitle
          icon="hub"
          title="Core Services Telemetry"
          aside={
            health.data === undefined
              ? undefined
              : `${health.data.components.length} monitors active · polling every ${pollSeconds}s`
          }
        />
        {health.isPending && <p className={STATE_TEXT}>Checking the components…</p>}
        {health.isError && (
          <p role="alert" className={ALERT_TEXT}>
            {loadErrorText(health.error, 'system health')}
          </p>
        )}
        {recheck.isError && (
          <p role="alert" className="text-body-default text-crit">
            Could not recheck the component.
          </p>
        )}
        {health.data !== undefined && (
          <HealthCards
            components={health.data.components}
            endpoints={endpoints}
            dispatcher={dispatcher.data}
            canConfigure={isSuperadmin}
            rechecking={recheck.isPending ? (recheck.variables ?? null) : null}
            onRecheck={(name) => recheck.mutate(name)}
          />
        )}
      </section>

      <div ref={toolsRef} className="scroll-mt-20">
        <ToolsSection enabled={allowed} />
      </div>

      {isSuperadmin && (
        <section aria-label="Operating thresholds" className="flex flex-col gap-space-md">
          <SectionTitle icon="tune" title="Operating Thresholds" />
          <SettingsPanel />
        </section>
      )}

      {allowed && (
        <section
          id="application-log"
          aria-label="Application log"
          className="flex scroll-mt-16 flex-col gap-space-md"
        >
          <SectionTitle icon="receipt_long" title="Application Log" />
          <LogPanel canDelete={isSuperadmin} />
        </section>
      )}

      {openRun !== null && <DiagnosticsDialog runId={openRun} onClose={() => setOpenRun(null)} />}
    </div>
  );
}
