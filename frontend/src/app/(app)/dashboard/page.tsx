'use client';

import { useQueryClient } from '@tanstack/react-query';
import { type ReactElement, useEffect, useState } from 'react';

import { type Alert, alertKeys, useAlerts } from '@/lib/alerts';

import { NAV_GROUPS } from '@/components/nav-items';
import { type AssetEvent, assetEventKeys, useAssetEvents } from '@/lib/asset-events';
import {
  DASHBOARD_WINDOWS,
  type DashboardSummary,
  type DashboardWindow,
  dashboardKeys,
  useDashboardSummary,
} from '@/lib/dashboard';
import { type FindingRow, findingKeys, SEVERITY_LABEL, useFindings } from '@/lib/findings';
import { type Job, JOB_STATUS_LABEL, type JobStatus, jobKeys, useJobs } from '@/lib/jobs';
import { SEVERITIES, type Severity } from '@/lib/programs';
import { useRealtimeStatus } from '@/lib/realtime';
import { useToolModules } from '@/lib/tool-modules';

import { shortId } from '../programs/links';

import {
  type Breakdown,
  BreakdownPanel,
  COUNT,
  type FeedItem,
  FeedRow,
  type Rank,
  RankPanel,
  StatTile,
  type Tone,
  type Trend,
  TrendPanel,
} from './panels';

/** The mockup's promise: "Auto-refreshes every 30s". */
const REFRESH_MS = 30_000;

/** How many lines the feed shows: the newest only, the full lists live on S03, S10, S20. */
const FEED_LIMIT = 8;

const PERIOD: Readonly<Record<DashboardWindow, string>> = {
  '24h': 'today',
  '7d': 'this week',
  '30d': 'this month',
};

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

const JOB_CAPTION: Readonly<Record<JobStatus, string>> = {
  pending_approval: 'Needs approval',
  queued: 'Waiting',
  dispatched: 'Assigned',
  running: 'Active',
  completed: 'Done',
  failed: 'Errors',
  cancelled: 'Withdrawn',
};

// The mockup's two rows of job tiles, widened to hold the two statuses it does not draw, so
// the panel stays as tall as Findings by Severity beside it.
const JOB_ROWS: readonly (readonly JobStatus[])[] = [
  ['pending_approval', 'queued'],
  ['dispatched', 'running', 'completed', 'failed', 'cancelled'],
];

const ASSET_ICON: Readonly<Record<AssetEvent['asset_type'], string>> = {
  domain: 'public',
  ip: 'dns',
  url: 'link',
  service: 'settings_ethernet',
};

/** The route of a sidebar screen, or null while it is not built. */
function routeOf(label: string): string | null {
  return NAV_GROUPS.flatMap((g) => g.items).find((i) => i.label === label)?.href ?? null;
}

const PERCENT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

function percent(ratio: number): string {
  return `${PERCENT.format(ratio * 100)}%`;
}

/** The clock the feed's "12s ago" is measured against, ticking with the refresh. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), REFRESH_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}

const JOB_ICON: Readonly<Record<JobStatus, string>> = {
  pending_approval: 'pending_actions',
  queued: 'schedule',
  dispatched: 'send',
  running: 'progress_activity',
  completed: 'check_circle',
  failed: 'error',
  cancelled: 'block',
};

const ASSET_NOUN: Readonly<Record<AssetEvent['asset_type'], [string, string]>> = {
  domain: ['domain', 'domains'],
  ip: ['IP', 'IPs'],
  url: ['URL', 'URLs'],
  service: ['service', 'services'],
};

function newest(values: readonly (string | null)[]): string {
  return values
    .filter((v): v is string => v !== null)
    .reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a));
}

/** Asset events of one job, type and kind become one line, as the mockup writes "Discovered
 * 148 endpoints … via gau": the job a parser ran for is what produced them together. */
export function groupAssetEvents(events: readonly AssetEvent[]): AssetEvent[][] {
  const groups = new Map<string, AssetEvent[]>();
  for (const event of events) {
    const key = `${event.job_id ?? event.id}|${event.asset_type}|${event.event_type}`;
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [event]);
    else group.push(event);
  }
  return [...groups.values()];
}

function assetItem(group: readonly AssetEvent[]): FeedItem {
  const first = group[0] as AssetEvent;
  const [one, many] = ASSET_NOUN[first.asset_type];
  const asn =
    first.asset_type === 'ip' && group.length === 1 && first.asn != null
      ? `AS${first.asn}${first.asn_org ? ` ${first.asn_org}` : ''}`
      : null;
  return {
    key: `asset-${first.id}`,
    at: newest(group.map((e) => e.created_at)),
    icon: ASSET_ICON[first.asset_type],
    tone: first.asset_type,
    text: (
      <>
        {first.event_type === 'discovered' ? 'Discovered' : 'Changed'}{' '}
        {group.length === 1 ? (
          <>
            {one} <span className="font-body-code-bold text-primary">{first.asset_name}</span>
            {asn !== null && (
              <>
                {' '}
                (<span className="font-body-code text-fg-muted">{asn}</span>)
              </>
            )}
          </>
        ) : (
          <>
            <span className="font-body-code-bold text-primary">{COUNT.format(group.length)}</span>{' '}
            {many} (<span className="font-body-code text-fg">{first.asset_name}</span> and{' '}
            {COUNT.format(group.length - 1)} more)
          </>
        )}
        {first.tool_module_name ? (
          <>
            {' '}
            via <span className="font-body-code text-fg-muted">{first.tool_module_name}</span>
          </>
        ) : null}{' '}
        under program <span className="font-body-code text-fg-muted">{first.program_name}</span>
      </>
    ),
  };
}

function findingItem(finding: FindingRow): FeedItem {
  return {
    key: `finding-${finding.id}`,
    at: finding.first_seen_at,
    icon: 'warning',
    tone: 'crit',
    text: (
      <>
        {finding.tool_module_name ? (
          <>
            <span className="font-body-code text-fg-muted">{finding.tool_module_name}</span> found
          </>
        ) : (
          'Found'
        )}{' '}
        <span className="font-body-code-bold text-crit">{finding.cve[0] ?? finding.name}</span>
        {finding.matched_at !== null && (
          <>
            {' '}
            on <span className="font-body-code text-primary">{finding.matched_at}</span>
          </>
        )}
      </>
    ),
  };
}

function jobItem(job: Job, toolName: string | undefined): FeedItem {
  const targets = job.target.length;
  return {
    key: `job-${job.id}`,
    at: newest([job.created_at, job.dispatched_at, job.started_at, job.finished_at]),
    icon: JOB_ICON[job.status],
    tone: job.status === 'failed' ? 'crit' : 'job',
    text: (
      <>
        Job <span className="font-body-code text-fg">#{shortId(job.id)}</span>{' '}
        {JOB_STATUS_LABEL[job.status].toLowerCase()} (
        <span className="font-body-code text-fg-muted">
          {job.tool_module_name ?? toolName ?? 'unknown tool module'}
        </span>{' '}
        across {COUNT.format(targets)} {targets === 1 ? 'target' : 'targets'})
      </>
    ),
  };
}

/** Decision N6: alerts of type `cert_expiring` join the feed. */
function certItem(alert: Alert): FeedItem {
  return {
    key: `alert-${alert.id}`,
    at: alert.created_at,
    icon: 'flag',
    tone: 'warn',
    text: (
      <>
        TLS certificate expiry warning:{' '}
        <span className="font-body-code text-fg">{alert.message}</span>
      </>
    ),
  };
}

function trendsOf(data: DashboardSummary): Trend[] {
  return [
    {
      tone: 'domain',
      label: 'Domains Discovered',
      values: data.new_assets_daily.map((d) => d.domain),
    },
    { tone: 'url', label: 'Endpoints / URLs', values: data.new_assets_daily.map((d) => d.url) },
    { tone: 'ip', label: 'IPs Resolved', values: data.new_assets_daily.map((d) => d.ip) },
  ];
}

function severityRows(data: DashboardSummary): Breakdown[][] {
  const tile = (s: Severity): Breakdown => ({
    key: s,
    label: SEVERITY_LABEL[s],
    caption: 'Active',
    tone: SEVERITY_TONE[s],
    count: data.findings_by_severity[s],
  });
  return [SEVERITIES.slice(0, 2).map(tile), SEVERITIES.slice(2).map(tile)];
}

function jobRows(data: DashboardSummary): Breakdown[][] {
  const total = Object.values(data.jobs_by_status).reduce((n, c) => n + c, 0);
  const tile = (s: JobStatus): Breakdown => ({
    key: s,
    label: JOB_STATUS_LABEL[s],
    caption: JOB_CAPTION[s],
    tone: JOB_TONE[s],
    count: data.jobs_by_status[s],
  });
  const [first, ...rest] = JOB_ROWS.map((row) => row.map(tile));
  const totalTile: Breakdown = {
    key: 'total',
    label: 'Total jobs',
    caption: 'All jobs',
    tone: 'total',
    count: total,
    inBar: false,
  };
  return [[totalTile, ...first], ...rest];
}

export default function DashboardPage(): ReactElement {
  const client = useQueryClient();
  const [span, setSpan] = useState<DashboardWindow>('24h');
  const [frozen, setFrozen] = useState<FeedItem[] | null>(null);
  const paused = frozen !== null;
  const now = useNow();
  // Decision N7: the feed follows the WebSocket; it polls only while the socket is down.
  const live = useRealtimeStatus() === 'open';

  const poll = { refetchInterval: REFRESH_MS } as const;
  const feedPoll = { refetchInterval: paused || live ? false : REFRESH_MS } as const;
  const summary = useDashboardSummary(span, poll);
  const events = useAssetEvents({ limit: FEED_LIMIT }, null, feedPoll);
  const findings = useFindings({ sort: '-first_seen_at', limit: FEED_LIMIT }, null, feedPoll);
  // Newest jobs whatever their status, so dispatches and failures show as well as completions.
  const jobs = useJobs({ sort: '-created_at', limit: FEED_LIMIT }, null, feedPoll);
  const alerts = useAlerts(FEED_LIMIT);
  const toolModules = useToolModules();
  const data = summary.data;

  const refresh = () => {
    for (const queryKey of [
      dashboardKeys.all,
      assetEventKeys.all,
      findingKeys.all,
      jobKeys.all,
      alertKeys.all,
    ]) {
      void client.invalidateQueries({ queryKey });
    }
  };

  const loading = <p className="text-body-default text-fg-muted">Loading…</p>;
  const summaryState = summary.isError ? (
    <p role="alert" className="text-body-default text-crit">
      Could not load the dashboard figures.
    </p>
  ) : (
    loading
  );
  const figure = (value: number | undefined) =>
    data !== undefined ? (value ?? null) : summary.isError ? null : undefined;
  const fig = (value: number | undefined) => (value === undefined ? '…' : COUNT.format(value));

  const toolName = new Map((toolModules.data?.items ?? []).map((m) => [m.id, m.name]));
  const feedFailed = events.isError || findings.isError || jobs.isError;
  const feedReady =
    events.data !== undefined && findings.data !== undefined && jobs.data !== undefined;
  const feedNow: FeedItem[] = feedReady
    ? [
        ...groupAssetEvents(events.data.items).map(assetItem),
        ...findings.data.items.map(findingItem),
        ...jobs.data.items.map((j) => jobItem(j, toolName.get(j.tool_module_id))),
        // The bell's alerts are optional here: a failed read leaves the cert lines out.
        ...(alerts.data?.items ?? []).filter((a) => a.alert_type === 'cert_expiring').map(certItem),
      ]
        .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
        .slice(0, FEED_LIMIT)
    : [];
  // Paused, the stream holds the lines it showed; refreshes land again on resume.
  const feed = frozen ?? feedNow;

  const programs: Rank[] | undefined = data?.top_programs.map((p) => ({
    key: p.id,
    name: p.name,
    count: p.domain_count,
    unit: 'domains',
  }));
  const ports: Rank[] | undefined = data?.top_ports.map((p) => ({
    key: `${p.port}/${p.transport}`,
    name: `${p.port}/${p.transport}`,
    note: p.name ?? undefined,
    count: p.count,
    unit: 'services',
  }));
  const severityTotal =
    data === undefined
      ? undefined
      : SEVERITIES.reduce((n, s) => n + data.findings_by_severity[s], 0);

  return (
    <div className="space-y-gutter">
      <div className="flex flex-col justify-between gap-space-md md:flex-row md:items-center">
        <div className="space-y-0.5">
          <div className="flex items-center gap-space-sm">
            <h1 className="font-headline-lg text-headline-lg tracking-tight text-fg">
              Recon Overview
            </h1>
            {summary.isError ? (
              <span className="inline-flex items-center gap-1.5 rounded-sm bg-crit-soft px-2 py-0.5 font-caption text-caption text-crit">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-crit" />
                OUT OF SYNC
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-sm bg-surface-2 px-2 py-0.5 font-caption text-caption text-fg-faint">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 animate-pulse rounded-full bg-good"
                />
                {summary.isSuccess ? 'SYNCED' : 'SYNCING'}
              </span>
            )}
          </div>
          <p className="font-body-default text-body-default text-fg-muted">
            {data === undefined
              ? 'Assets discovered across the programs you can see.'
              : `Assets discovered across ${COUNT.format(data.programs)} ${
                  data.programs === 1 ? 'program' : 'programs'
                }.`}{' '}
            Auto-refreshes every 30s.
          </p>
        </div>
        <div className="flex items-center gap-space-sm self-start md:self-auto">
          <div
            role="group"
            aria-label="Time window"
            className="flex items-center rounded-sm bg-surface-2 p-0.5"
          >
            {DASHBOARD_WINDOWS.map((w) => (
              <button
                key={w}
                type="button"
                aria-pressed={span === w}
                onClick={() => setSpan(w)}
                className={`rounded-sm px-3 py-1 font-label-caps text-caption uppercase transition-colors focus:ring-2 focus:ring-ring focus:outline-none ${
                  span === w ? 'bg-surface-3 text-fg shadow-sm' : 'text-fg-faint hover:text-fg'
                }`}
              >
                {w}
              </button>
            ))}
          </div>
          <div aria-hidden="true" className="hidden h-5 w-px bg-surface-3 sm:block" />
          <button
            type="button"
            onClick={refresh}
            className="flex h-8.5 items-center gap-1.5 rounded-sm bg-surface-2 px-3 font-body-default text-body-default text-fg shadow-sm transition-all hover:bg-surface-3 focus:ring-2 focus:ring-ring focus:outline-none active:scale-95"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-primary">
              sync
            </span>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-gutter sm:grid-cols-2 lg:grid-cols-5">
        <StatTile
          label="Programs"
          icon="adjust"
          accent="primary"
          value={figure(data?.programs)}
          added={figure(data?.programs_new)}
          period={PERIOD[span]}
          trendIcon="trending_up"
        />
        {(
          [
            ['Domains', 'public', 'domain'],
            ['URLs', 'link', 'url'],
            ['IPs', 'dns', 'ip'],
            ['Services', 'hub', 'service'],
          ] as const
        ).map(([label, icon, type]) => (
          <StatTile
            key={type}
            label={label}
            icon={icon}
            accent={type}
            value={figure(data?.assets[type])}
            added={figure(data?.assets_new[type])}
            period={PERIOD[span]}
            trendIcon="arrow_upward"
            // Decision M3: the Services tile counts services closed in the window.
            closed={
              type === 'service' ? { value: figure(data?.assets_closed?.service) } : undefined
            }
          />
        ))}
      </div>

      <TrendPanel trends={data === undefined ? undefined : trendsOf(data)} />

      <div className="grid grid-cols-1 gap-gutter lg:grid-cols-2">
        <RankPanel
          title="Top Programs by Domains"
          icon="adjust"
          tone="primary"
          viewAll={routeOf('Programs')}
          rows={programs}
          empty="No programs with domains yet."
          footer={[
            `Active targets: ${fig(data?.programs_active)} active`,
            `Scope coverage: ${
              data === undefined
                ? '…'
                : data.scope_coverage === null
                  ? '–'
                  : percent(data.scope_coverage)
            }`,
          ]}
        />
        <RankPanel
          title="Top Open Ports"
          icon="terminal"
          tone="service"
          tag="by service"
          viewAll={routeOf('Monitor') === null ? null : `${routeOf('Monitor')}?tab=services`}
          rows={ports}
          empty="No open ports found yet."
          footer={[
            `Active services: ${fig(data?.assets.service)}`,
            `Top protocol: ${
              data === undefined
                ? '…'
                : data.top_service_name === null
                  ? '–'
                  : `${data.top_service_name.name.toUpperCase()} (${percent(data.top_service_name.ratio)})`
            }`,
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-gutter lg:grid-cols-2">
        <BreakdownPanel
          title="Findings by Severity"
          icon="security"
          iconTone="crit"
          viewAll={routeOf('Findings')}
          rows={data === undefined ? undefined : severityRows(data)}
          outlined={false}
          state={summaryState}
          footer={{
            dot: 'crit',
            left: `${fig(data?.confirmed_cve_findings_24h)} CVEs verified in past 24h`,
            right: `Total: ${fig(severityTotal)}`,
          }}
        />
        <BreakdownPanel
          title="Queue Snapshot"
          icon="layers"
          iconTone="primary"
          viewAll={routeOf('Queue')}
          rows={data === undefined ? undefined : jobRows(data)}
          outlined
          state={summaryState}
          footer={{
            dot: 'good',
            left: `Worker instances: ${fig(data?.workers_online)} running`,
            right: `Throughput: ~${
              data === undefined ? '…' : PERCENT.format(data.jobs_per_minute)
            } jobs/min`,
          }}
        />
      </div>

      <div className="rounded-sm bg-surface p-space-lg shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden="true"
              className={`h-2 w-2 shrink-0 rounded-full ${
                paused ? 'bg-fg-faint' : live ? 'animate-ping bg-good' : 'bg-warn'
              }`}
            />
            <h2 className="font-panel-title text-panel-title text-fg">
              Recent Activity (Live WebSocket)
            </h2>
            {/* While the socket is down the feed falls back to polling, and says so. */}
            <span className="hidden rounded-sm bg-surface-2 px-1.5 py-0.5 font-caption text-caption text-fg-faint sm:inline">
              {live ? 'stream::recon.events' : 'reconnecting · polling 30s'}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="font-body-code text-caption text-fg-faint">
              Auto-scroll: {paused ? 'OFF' : 'ON'}
            </span>
            <button
              type="button"
              aria-pressed={paused}
              aria-label={paused ? 'Resume stream' : 'Pause stream'}
              title={paused ? 'Resume Stream' : 'Pause Stream'}
              onClick={() => setFrozen(paused ? null : feedNow)}
              className="rounded-sm p-1 text-fg-faint transition-colors hover:bg-surface-2 hover:text-fg focus:ring-2 focus:ring-ring focus:outline-none"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                {paused ? 'play_arrow' : 'pause'}
              </span>
            </button>
          </div>
        </div>
        {feedFailed ? (
          <p role="alert" className="text-body-default text-crit">
            Could not load the recent activity.
          </p>
        ) : !feedReady ? (
          <p className="text-body-default text-fg-muted">Loading activity…</p>
        ) : feed.length === 0 ? (
          <p className="text-body-default text-fg-muted">No activity yet.</p>
        ) : (
          <div className="space-y-1.5 font-body-default text-body-default">
            {feed.map((item) => (
              <FeedRow key={item.key} item={item} now={now} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
