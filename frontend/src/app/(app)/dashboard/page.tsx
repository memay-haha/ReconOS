'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import { NAV_GROUPS } from '@/components/nav-items';
import { assetEventKeys, useAssetEvents } from '@/lib/asset-events';
import { dashboardKeys, useDashboardSummary } from '@/lib/dashboard';
import { SEVERITY_LABEL } from '@/lib/findings';
import { JOB_STATUS_LABEL, JOB_STATUSES, type JobStatus } from '@/lib/jobs';
import { SEVERITIES, type Severity } from '@/lib/programs';

import { ActivityRow, type Breakdown, BreakdownPanel, StatTile, type Tone } from './panels';

/** How many asset events the feed shows: the newest only, the full list lives on S03. */
const ACTIVITY_LIMIT = 8;

const SEVERITY_TONE: Readonly<Record<Severity, Tone>> = {
  critical: 'crit',
  high: 'error',
  medium: 'warn',
  low: 'info',
  info: 'neutral',
};

const JOB_TONE: Readonly<Record<JobStatus, Tone>> = {
  pending_approval: 'warn',
  queued: 'muted',
  dispatched: 'info',
  running: 'warn',
  completed: 'good',
  failed: 'crit',
  cancelled: 'neutral',
};

/** The route of a sidebar screen, or null while its part has not built it. */
function routeOf(label: string): string | null {
  return NAV_GROUPS.flatMap((g) => g.items).find((i) => i.label === label)?.href ?? null;
}

const COUNT = new Intl.NumberFormat('en-US');

export default function DashboardPage(): ReactElement {
  const client = useQueryClient();
  const summary = useDashboardSummary();
  const events = useAssetEvents({ limit: ACTIVITY_LIMIT });
  const data = summary.data;

  const refresh = () => {
    void client.invalidateQueries({ queryKey: dashboardKeys.summary });
    void client.invalidateQueries({ queryKey: assetEventKeys.all });
  };

  const figure = (value: number | undefined) =>
    data !== undefined ? (value ?? null) : summary.isError ? null : undefined;

  const summaryState = summary.isError ? (
    <p role="alert" className="text-body-default text-crit">
      Could not load the dashboard figures.
    </p>
  ) : (
    <p className="text-body-default text-fg-muted">Loading…</p>
  );

  const severities: Breakdown[] | undefined =
    data === undefined
      ? undefined
      : SEVERITIES.map((s) => ({
          key: s,
          label: SEVERITY_LABEL[s],
          tone: SEVERITY_TONE[s],
          count: data.findings_by_severity[s],
        }));
  const jobs: Breakdown[] | undefined =
    data === undefined
      ? undefined
      : JOB_STATUSES.map((s) => ({
          key: s,
          label: JOB_STATUS_LABEL[s],
          tone: JOB_TONE[s],
          count: data.jobs_by_status[s],
        }));

  return (
    <div className="flex w-full flex-col gap-gutter">
      <div className="flex flex-col justify-between gap-space-md md:flex-row md:items-center">
        <div className="space-y-0.5">
          <h1 className="font-headline-lg text-headline-lg tracking-tight text-fg">
            Recon Overview
          </h1>
          <p className="text-body-default text-fg-muted">
            {data === undefined
              ? 'Assets discovered across the programs you can see.'
              : `Assets discovered across ${COUNT.format(data.programs)} ${
                  data.programs === 1 ? 'program' : 'programs'
                }.`}
          </p>
        </div>
        <div className="flex items-center gap-space-sm">
          <button
            type="button"
            onClick={refresh}
            className="flex h-8.5 items-center gap-1.5 rounded-sm bg-surface-2 px-space-md font-body-default text-body-default text-fg shadow-sm transition-all hover:bg-surface-3 focus:ring-2 focus:ring-ring focus:outline-none active:scale-95"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-primary">
              sync
            </span>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-gutter sm:grid-cols-2 lg:grid-cols-5">
        <StatTile label="Programs" icon="adjust" accent="primary" value={figure(data?.programs)} />
        <StatTile
          label="Domains"
          icon="public"
          accent="domain"
          value={figure(data?.assets.domain)}
        />
        <StatTile label="URLs" icon="link" accent="url" value={figure(data?.assets.url)} />
        <StatTile label="IPs" icon="dns" accent="ip" value={figure(data?.assets.ip)} />
        <StatTile
          label="Services"
          icon="hub"
          accent="service"
          value={figure(data?.assets.service)}
        />
      </div>

      <div className="grid grid-cols-1 gap-gutter lg:grid-cols-2">
        <BreakdownPanel
          title="Findings by Severity"
          icon="security"
          iconTone="crit"
          viewAll={routeOf('Findings')}
          parts={severities}
          state={summaryState}
          rows={[2, 3]}
          total={{ label: 'Total', as: 'footer' }}
        />
        <BreakdownPanel
          title="Jobs"
          icon="layers"
          iconTone="primary"
          viewAll={routeOf('Queue')}
          parts={jobs}
          state={summaryState}
          rows={[4, 4]}
          total={{ label: 'Total jobs', as: 'tile' }}
        />
      </div>

      <div className="rounded-sm bg-surface p-space-lg shadow-sm">
        <div className="mb-gutter flex items-center justify-between">
          <h2 className="font-panel-title text-panel-title text-fg">Recent Activity</h2>
        </div>
        {events.isPending && <p className="text-body-default text-fg-muted">Loading activity…</p>}
        {events.isError && (
          <p role="alert" className="text-body-default text-crit">
            Could not load the recent activity.
          </p>
        )}
        {events.data !== undefined && events.data.items.length === 0 && (
          <p className="text-body-default text-fg-muted">No asset events yet.</p>
        )}
        {events.data !== undefined && events.data.items.length > 0 && (
          <div className="space-y-1.5 font-body-default text-body-default">
            {events.data.items.map((event) => (
              <ActivityRow key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
