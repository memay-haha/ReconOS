'use client';

import { type ReactElement, useState } from 'react';

import { useMe } from '@/lib/auth';
import { useSystemHealth } from '@/lib/system';
import { useWorkers } from '@/lib/workers';

import { HealthCards, HealthTiles } from './health-cards';
import { LogPanel } from './log-panel';
import { ALERT_TEXT, PANEL, STATE_TEXT } from './modal';
import { SettingsPanel } from './settings-panel';
import { loadErrorText, NoAccess, PageHeader } from './states';
import { WorkersTable } from './workers-table';

type View = 'services' | 'tools';

const SEGMENT = 'rounded-sm px-space-md py-space-xs text-label-caps uppercase';
const SEGMENT_ON = `${SEGMENT} bg-surface-3 text-primary`;
const SEGMENT_OFF = `${SEGMENT} text-fg-muted hover:text-fg`;

function SectionTitle({ icon, title }: { icon: string; title: string }): ReactElement {
  return (
    <div className="flex items-center gap-space-sm border-b border-border pb-space-sm">
      <span aria-hidden="true" className="material-symbols-outlined text-icon text-primary">
        {icon}
      </span>
      <h2 className="text-panel-title text-fg">{title}</h2>
    </div>
  );
}

/** S15. Superadmin and Admin read it; thresholds and log deletion are Superadmin only. */
export default function SystemPage(): ReactElement {
  const me = useMe();
  const role = me.data?.role;
  const allowed = role === 'superadmin' || role === 'admin';
  const [view, setView] = useState<View>('services');
  const health = useSystemHealth(allowed);
  const workers = useWorkers(null, allowed);

  if (me.data !== undefined && !allowed) return <NoAccess what="System Health" />;

  return (
    <div className="flex w-full flex-col gap-space-lg">
      <PageHeader
        section="System"
        current="Health & Tools"
        title="System Health"
        description="Status of each stack component, the workers and their tool modules, operating thresholds and the application log."
      >
        <div className="flex flex-wrap items-center gap-space-sm">
          <div className="flex items-center rounded-sm border border-border bg-surface-2 p-0.5">
            <button
              type="button"
              aria-pressed={view === 'services'}
              onClick={() => setView('services')}
              className={view === 'services' ? SEGMENT_ON : SEGMENT_OFF}
            >
              Services
            </button>
            <button
              type="button"
              aria-pressed={view === 'tools'}
              onClick={() => setView('tools')}
              className={view === 'tools' ? SEGMENT_ON : SEGMENT_OFF}
            >
              Tools
            </button>
          </div>
          <button
            type="button"
            onClick={() => void health.refetch()}
            disabled={health.isFetching}
            className="inline-flex h-9 items-center gap-space-xs rounded-sm border border-border bg-surface px-space-md text-label-caps uppercase text-fg hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-icon text-fg-muted">
              refresh
            </span>
            Refresh
          </button>
        </div>
      </PageHeader>

      <HealthTiles
        components={health.data?.components}
        workersOnline={health.isError ? null : health.data?.workers_online}
        queueLength={health.isError ? null : health.data?.queue_length}
      />

      <section
        aria-label="Core services"
        hidden={view !== 'services'}
        className="flex flex-col gap-space-md"
      >
        <SectionTitle icon="hub" title="Core Services" />
        {health.isPending && <p className={STATE_TEXT}>Checking the components…</p>}
        {health.isError && (
          <p role="alert" className={ALERT_TEXT}>
            {loadErrorText(health.error, 'system health')}
          </p>
        )}
        {health.data !== undefined && <HealthCards components={health.data.components} />}
      </section>

      <section
        aria-label="Workers and tool modules"
        hidden={view !== 'tools'}
        className="flex flex-col gap-space-md"
      >
        <SectionTitle icon="terminal" title="Workers & Tool Modules" />
        <div className={PANEL}>
          {workers.isPending && <p className={STATE_TEXT}>Loading the workers…</p>}
          {workers.isError && (
            <p role="alert" className={ALERT_TEXT}>
              {loadErrorText(workers.error, 'worker list')}
            </p>
          )}
          {workers.data !== undefined && <WorkersTable workers={workers.data.items} />}
        </div>
      </section>

      {role === 'superadmin' && (
        <section aria-label="Operating thresholds" className="flex flex-col gap-space-md">
          <SectionTitle icon="tune" title="Operating Thresholds" />
          <SettingsPanel />
        </section>
      )}

      {allowed && (
        <section aria-label="Application log" className="flex flex-col gap-space-md">
          <SectionTitle icon="receipt_long" title="Application Log" />
          <LogPanel canDelete={role === 'superadmin'} />
        </section>
      )}
    </div>
  );
}
