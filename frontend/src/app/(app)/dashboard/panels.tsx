import Link from 'next/link';
import { type ReactElement, type ReactNode, useId } from 'react';

import { formatAgo } from '@/lib/format-ago';
import { formatMoment } from '@/lib/format-moment';

export const COUNT = new Intl.NumberFormat('en-US');

/** The colour of a KPI tile: the mockup gives each asset type its own accent. */
export type Accent = 'primary' | 'domain' | 'url' | 'ip' | 'service';

const ACCENT_BAR: Readonly<Record<Accent, string>> = {
  primary: 'bg-primary-container',
  domain: 'bg-asset-domain',
  url: 'bg-asset-url',
  ip: 'bg-asset-ip',
  service: 'bg-asset-service',
};

// The Programs tile keeps a muted icon under its cyan bar, as the mockup draws it.
const ACCENT_ICON: Readonly<Record<Accent, string>> = {
  primary: 'text-fg-faint',
  domain: 'text-asset-domain',
  url: 'text-asset-url',
  ip: 'text-asset-ip',
  service: 'text-asset-service',
};

/** One KPI of `GET /dashboard/summary`. `undefined` is still loading, `null` unavailable. */
export function StatTile({
  label,
  icon,
  accent,
  value,
  added,
  period,
  trendIcon,
  closed,
}: {
  label: string;
  icon: string;
  accent: Accent;
  value: number | null | undefined;
  /** New in the chosen window, from `programs_new` or `assets_new`. */
  added: number | null | undefined;
  period: string;
  trendIcon: string;
  /** Given, the footer counts what closed in the window instead (decision M3: services). */
  closed?: { readonly value: number | null | undefined };
}): ReactElement {
  const grew = added !== null && added !== undefined && added > 0;
  if (closed !== undefined) {
    return (
      <Tile label={label} icon={icon} accent={accent} value={value}>
        <div className="mt-4 flex items-center gap-1.5 font-caption text-caption text-warn">
          <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
            remove
          </span>
          <span>
            {closed.value === undefined
              ? '…'
              : closed.value === null
                ? '–'
                : `−${COUNT.format(closed.value)} closed`}
          </span>
        </div>
      </Tile>
    );
  }
  return (
    <Tile label={label} icon={icon} accent={accent} value={value}>
      <div
        className={`mt-4 flex items-center gap-1.5 font-caption text-caption ${grew ? 'text-good' : 'text-warn'}`}
      >
        <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
          {grew ? trendIcon : 'remove'}
        </span>
        <span>
          {added === undefined || added === null
            ? '…'
            : `${grew ? '+' : ''}${COUNT.format(added)} ${period}`}
        </span>
      </div>
    </Tile>
  );
}

function Tile({
  label,
  icon,
  accent,
  value,
  children,
}: {
  label: string;
  icon: string;
  accent: Accent;
  value: number | null | undefined;
  children: ReactNode;
}): ReactElement {
  return (
    <div
      data-stat-tile
      className="relative flex flex-col justify-between overflow-hidden rounded-sm bg-surface p-space-lg shadow-sm"
    >
      <div
        aria-hidden="true"
        className={`absolute top-0 right-0 left-0 h-0.75 ${ACCENT_BAR[accent]}`}
      />
      <div>
        <div className="flex items-start justify-between">
          <span className="font-label-caps text-label-caps tracking-wider text-fg-faint uppercase">
            {label}
          </span>
          <span
            aria-hidden="true"
            className={`material-symbols-outlined text-[18px] ${ACCENT_ICON[accent]}`}
          >
            {icon}
          </span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-stat-lg text-stat-lg tracking-tight text-fg">
            {value === undefined ? '…' : value === null ? '–' : COUNT.format(value)}
          </span>
        </div>
      </div>
      {children}
    </div>
  );
}

/** Colour of one small multiple in New Assets Discovered. */
export type TrendTone = 'domain' | 'url' | 'ip';

const TREND_TEXT: Readonly<Record<TrendTone, string>> = {
  domain: 'text-asset-domain',
  url: 'text-asset-url',
  ip: 'text-asset-ip',
};

const PEAK_CHIP: Readonly<Record<TrendTone, string>> = {
  domain: 'bg-good-soft text-good',
  url: 'bg-info-soft text-info',
  ip: 'bg-warn-soft text-warn',
};

const LEGEND_DOT: Readonly<Record<TrendTone, string>> = {
  domain: 'bg-asset-domain',
  url: 'bg-asset-url',
  ip: 'bg-asset-ip',
};

const CHART_W = 280;
const CHART_H = 64;
const CHART_PAD = 6;

/** A smooth line through the points (Catmull-Rom as cubic Béziers), as the mockup draws it. */
function smoothPath(points: readonly (readonly [number, number])[]): string {
  if (points.length === 0) return '';
  const [first] = points;
  let d = `M${first[0]},${first[1]}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0]},${p2[1].toFixed(1)}`;
  }
  return d;
}

function Sparkline({ values, tone }: { values: readonly number[]; tone: TrendTone }) {
  const gradient = useId();
  const peak = Math.max(1, ...values);
  const step = values.length > 1 ? CHART_W / (values.length - 1) : 0;
  const points = values.map(
    (v, i) =>
      [Math.round(i * step), CHART_H - CHART_PAD - (v / peak) * (CHART_H - 2 * CHART_PAD)] as const,
  );
  const line = smoothPath(points);
  const last = points.at(-1);
  return (
    <svg
      aria-hidden="true"
      className={`h-full w-full overflow-visible ${TREND_TEXT[tone]}`}
      preserveAspectRatio="none"
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
    >
      <defs>
        <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {line !== '' && (
        <>
          <path d={`${line} L${CHART_W},${CHART_H} L0,${CHART_H} Z`} fill={`url(#${gradient})`} />
          <path d={line} fill="none" stroke="currentColor" strokeWidth="2" />
        </>
      )}
      {last !== undefined && <circle cx={last[0]} cy={last[1]} fill="currentColor" r="3" />}
    </svg>
  );
}

export interface Trend {
  readonly tone: TrendTone;
  readonly label: string;
  readonly values: readonly number[];
}

/** New Assets Discovered (14 Days): one small multiple per asset type. */
export function TrendPanel({ trends }: { trends: readonly Trend[] | undefined }): ReactElement {
  return (
    <div className="rounded-sm bg-surface p-space-lg shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="font-panel-title text-panel-title text-fg">
            New Assets Discovered (14 Days)
          </h2>
          <span className="rounded-sm bg-surface-2 px-1.5 py-0.5 font-caption text-caption text-fg-faint uppercase">
            Aggregated Telemetry
          </span>
        </div>
        <div className="flex items-center gap-3 font-caption text-caption text-fg-faint">
          {(['domain', 'url', 'ip'] as const).map((tone) => (
            <span key={tone} className="flex items-center gap-1">
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${LEGEND_DOT[tone]}`} />
              {tone === 'domain' ? 'Domains' : tone === 'url' ? 'URLs' : 'IPs'}
            </span>
          ))}
        </div>
      </div>
      {trends === undefined ? (
        <p className="text-body-default text-fg-muted">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 gap-gutter md:grid-cols-3">
          {trends.map((trend) => (
            <div
              key={trend.tone}
              className="flex flex-col justify-between rounded-sm bg-surface-2 p-3"
            >
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <span
                    className={`font-label-caps text-label-caps uppercase ${TREND_TEXT[trend.tone]}`}
                  >
                    {trend.label}
                  </span>
                  <div className="mt-0.5 font-body-code-bold text-headline-lg text-fg">
                    +{COUNT.format(trend.values.at(-1) ?? 0)}
                  </div>
                </div>
                <div className="text-right">
                  <span className="block font-caption text-caption text-fg-faint">Peak 14d</span>
                  <span
                    className={`rounded-sm px-1.5 py-0.5 font-body-code text-caption ${PEAK_CHIP[trend.tone]}`}
                  >
                    {COUNT.format(Math.max(0, ...trend.values))}/d
                  </span>
                </div>
              </div>
              <div className="h-20 w-full pt-1">
                <Sparkline values={trend.values} tone={trend.tone} />
              </div>
              <div className="mt-2 flex items-center justify-between rounded-sm bg-surface-3/30 px-1.5 pt-1 font-body-code text-caption text-fg-faint">
                <span>D-14</span>
                <span>D-7</span>
                <span className="text-fg">Today</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ViewAll({ href, arrow }: { href: string | null; arrow: 'icon' | 'text' }) {
  if (href === null) return null;
  return arrow === 'icon' ? (
    <Link
      href={href}
      className="flex items-center gap-0.5 font-caption text-caption text-primary hover:underline"
    >
      <span>View all</span>
      <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
        arrow_forward
      </span>
    </Link>
  ) : (
    <Link href={href} className="font-caption text-caption text-primary hover:underline">
      View all →
    </Link>
  );
}

function Footer({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="mt-4 flex items-center justify-between border-t border-surface-2 pt-3 font-caption text-caption text-fg-faint">
      {left}
      {right}
    </div>
  );
}

export interface Rank {
  readonly key: string;
  readonly name: string;
  readonly note?: string;
  readonly count: number;
  readonly unit: string;
}

const RANK_ICON = {
  primary: 'text-primary',
  service: 'text-asset-service',
} as const;

const RANK_BAR = {
  primary: 'bg-primary-container',
  service: 'bg-asset-service',
} as const;

/** Top Programs by Domains and Top Open Ports: a bar per row, longest first. */
export function RankPanel({
  title,
  icon,
  tone,
  tag,
  viewAll,
  rows,
  empty,
  footer,
}: {
  title: string;
  icon: string;
  tone: keyof typeof RANK_ICON;
  tag?: string;
  viewAll: string | null;
  rows: readonly Rank[] | undefined;
  empty: string;
  footer: readonly [string, string];
}): ReactElement {
  const top = Math.max(1, ...(rows ?? []).map((r) => r.count));
  return (
    <div className="flex flex-col justify-between rounded-sm bg-surface p-space-lg shadow-sm">
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`material-symbols-outlined text-[18px] ${RANK_ICON[tone]}`}
            >
              {icon}
            </span>
            <h2 className="font-panel-title text-panel-title text-fg">{title}</h2>
            {tag !== undefined && (
              <span className="rounded-sm border border-border bg-surface-2 px-1.5 py-0.5 font-label-caps text-label-caps text-fg-muted uppercase">
                {tag}
              </span>
            )}
          </div>
          <ViewAll href={viewAll} arrow="icon" />
        </div>
        {rows === undefined ? (
          <p className="text-body-default text-fg-muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-body-default text-fg-muted">{empty}</p>
        ) : (
          <div className="space-y-3.5">
            {rows.map((row) => (
              <div key={row.key}>
                <div className="mb-1 flex items-center justify-between font-caption text-caption">
                  <div className="flex items-center gap-2">
                    <span className="font-body-code-bold text-body-code-bold text-fg">
                      {row.name}
                    </span>
                    {row.note !== undefined && (
                      <span className="font-caption text-caption text-fg-muted">{row.note}</span>
                    )}
                  </div>
                  <span className="font-body-code text-caption text-fg-muted">
                    {COUNT.format(row.count)} {row.unit}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                  <div
                    className={`h-full rounded-full ${RANK_BAR[tone]}`}
                    style={{ width: `${Math.round((row.count / top) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Footer left={<span>{footer[0]}</span>} right={<span>{footer[1]}</span>} />
    </div>
  );
}

export type Tone = 'crit' | 'error' | 'warn' | 'info' | 'good' | 'neutral' | 'muted' | 'total';

const BAR: Readonly<Record<Tone, string>> = {
  crit: 'bg-crit',
  error: 'bg-error',
  warn: 'bg-warn',
  info: 'bg-info',
  good: 'bg-good',
  neutral: 'bg-fg-muted',
  muted: 'bg-secondary-container',
  total: 'bg-surface-3',
};

const BADGE: Readonly<Record<Tone, string>> = {
  crit: 'bg-crit-soft text-crit',
  error: 'bg-crit-soft text-error',
  warn: 'bg-warn-soft text-warn',
  info: 'bg-info-soft text-info',
  good: 'bg-good-soft text-good',
  neutral: 'bg-surface-3 text-fg-muted',
  muted: 'bg-surface-3 text-fg-muted',
  total: 'bg-surface-3 text-fg-faint',
};

const PANEL_ICON = {
  crit: 'text-crit',
  primary: 'text-primary',
} as const;

const COLUMNS: Readonly<Record<number, string>> = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
};

const DOT = {
  crit: 'bg-crit',
  good: 'bg-good',
} as const;

export interface Breakdown {
  readonly key: string;
  readonly label: string;
  readonly caption: string;
  readonly tone: Tone;
  readonly count: number;
  /** A tile only: the Total jobs tile is not a slice of the bar. */
  readonly inBar?: boolean;
}

/** A stacked bar and rows of tiles, as the mockup draws Findings by Severity and the
 * Staging Snapshot. */
export function BreakdownPanel({
  title,
  icon,
  iconTone,
  viewAll,
  rows,
  outlined,
  state,
  footer,
}: {
  title: string;
  icon: string;
  iconTone: keyof typeof PANEL_ICON;
  viewAll: string | null;
  /** Tiles top to bottom, one array per row, as the mockup splits them. */
  rows: readonly (readonly Breakdown[])[] | undefined;
  outlined: boolean;
  state: ReactNode;
  footer: { readonly dot: keyof typeof DOT; readonly left: string; readonly right: string };
}): ReactElement {
  const slices = (rows ?? []).flat().filter((p) => p.inBar !== false);
  const sum = slices.reduce((n, p) => n + p.count, 0);
  return (
    <div className="flex flex-col justify-between rounded-sm bg-surface p-space-lg shadow-sm">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`material-symbols-outlined text-[18px] ${PANEL_ICON[iconTone]}`}
            >
              {icon}
            </span>
            <h2 className="font-panel-title text-panel-title text-fg">{title}</h2>
          </div>
          <ViewAll href={viewAll} arrow="text" />
        </div>
        {rows === undefined ? (
          state
        ) : (
          <>
            <div
              aria-hidden="true"
              className="mb-4 flex h-2.5 w-full overflow-hidden rounded-sm bg-surface-2"
            >
              {sum > 0 &&
                slices.map((p) => (
                  <div
                    key={p.key}
                    className={BAR[p.tone]}
                    style={{ width: `${(p.count / sum) * 100}%` }}
                    title={`${p.label}: ${COUNT.format(p.count)}`}
                  />
                ))}
            </div>
            <div className="space-y-2 text-center">
              {rows.map((row) => (
                <div
                  key={row.map((p) => p.key).join()}
                  className={`grid gap-2 ${COLUMNS[row.length]}`}
                >
                  {row.map((p) => (
                    <div
                      key={p.key}
                      className={`flex flex-col items-center rounded-sm bg-surface-2 p-2 ${outlined ? 'border border-border/40' : ''}`}
                    >
                      <span
                        id={`tile-${p.key}`}
                        className={`rounded-sm px-1.5 py-0.5 font-label-caps text-label-caps uppercase ${BADGE[p.tone]}`}
                      >
                        {p.label}
                      </span>
                      <span
                        aria-describedby={`tile-${p.key}`}
                        className="mt-1 font-stat-lg text-stat-lg text-fg"
                      >
                        {COUNT.format(p.count)}
                      </span>
                      <span className="font-caption text-caption text-fg-faint">{p.caption}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <Footer
        left={
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${DOT[footer.dot]}`} />
            {footer.left}
          </span>
        }
        right={<span className="font-body-code text-caption text-fg-muted">{footer.right}</span>}
      />
    </div>
  );
}

/** Colour of a feed row's icon square. */
export type FeedTone = 'domain' | 'ip' | 'url' | 'service' | 'crit' | 'warn' | 'job';

const FEED_TINT: Readonly<Record<FeedTone, string>> = {
  domain: 'bg-asset-domain/10 text-asset-domain',
  ip: 'bg-asset-ip/10 text-asset-ip',
  url: 'bg-asset-url/10 text-asset-url',
  service: 'bg-asset-service/10 text-asset-service',
  crit: 'bg-crit-soft text-crit',
  warn: 'bg-warn-soft text-warn',
  job: 'bg-surface-3 text-primary',
};

export interface FeedItem {
  readonly key: string;
  readonly at: string;
  readonly icon: string;
  readonly tone: FeedTone;
  /** Names come from targets: built from text nodes only, never HTML. */
  readonly text: ReactNode;
}

/** One line of Recent Activity. */
export function FeedRow({ item, now }: { item: FeedItem; now: number }): ReactElement {
  return (
    <div className="flex items-center justify-between rounded-sm p-2 transition-colors duration-150 hover:bg-surface-2">
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-sm ${FEED_TINT[item.tone]}`}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[15px]">
            {item.icon}
          </span>
        </div>
        <div className="truncate font-caption text-caption text-fg">{item.text}</div>
      </div>
      <time
        dateTime={item.at}
        title={formatMoment(item.at)}
        className="ml-3 shrink-0 font-body-code text-caption text-fg-faint"
      >
        {formatAgo(item.at, now)}
      </time>
    </div>
  );
}
