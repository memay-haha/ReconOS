'use client';

import { type KeyboardEvent, type ReactElement, useRef, useState } from 'react';

import { formatMoment } from '@/lib/format-moment';
import { rawOutputContentHref } from '@/lib/raw-outputs';
import {
  type ConsoleEntry,
  type NetworkEntry,
  type ScreenshotCookie,
  screenshotHarUrl,
} from '@/lib/screenshots';

import { STATUS_TONE, statusClass } from '../http-status';
import { formatBytes } from './detail-panels';

const COUNT = new Intl.NumberFormat('en-US');
const FOCUS = 'focus:outline-none focus:ring-2 focus:ring-ring';
/** Rows the network table shows before "Show all", as the mockup shows the top 6. */
const TOP = 6;

const TABS = [
  { id: 'network', label: 'Network Log', icon: 'lan' },
  { id: 'console', label: 'Console Log', icon: 'terminal' },
  { id: 'cookies', label: 'Cookies', icon: 'cookie' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const LEVEL_TONE: Readonly<Record<string, string>> = {
  error: 'text-crit',
  warn: 'text-warn',
  warning: 'text-warn',
  info: 'text-info',
};

function pathOf(url: string, base: string | null): string {
  // The first request reads in full, the rest as a path, like the mockup.
  if (base === null) return url;
  try {
    const u = new URL(url);
    const b = new URL(base);
    return u.host === b.host ? `${u.pathname}${u.search}` : url;
  } catch {
    return url;
  }
}

function NetworkTable({
  rows,
  pending,
  failed,
}: {
  rows: readonly NetworkEntry[];
  pending: boolean;
  failed: boolean;
}): ReactElement {
  const [all, setAll] = useState(false);
  if (pending)
    return <p className="p-3 text-body-default text-fg-muted">Loading the network log…</p>;
  if (failed) {
    return (
      <p role="alert" className="p-3 text-body-default text-crit">
        Could not load the network log.
      </p>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="p-3 text-body-default text-fg-muted">No network requests were recorded.</p>
    );
  }
  const shown = all ? rows : rows.slice(0, TOP);
  const bytes = rows.reduce((sum, r) => sum + (r.size_bytes ?? 0), 0);
  const ms = rows.reduce((sum, r) => sum + (r.duration_ms ?? 0), 0);
  const first = rows[0]?.url ?? null;
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-left font-body-code text-caption">
          <thead className="sticky top-0 border-b border-border bg-surface-2 text-label-caps uppercase text-fg-muted">
            <tr>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Method</th>
              <th className="px-3 py-2.5">Resource / Path</th>
              <th className="px-3 py-2.5">Remote IP</th>
              <th className="px-3 py-2.5 text-right">Size</th>
              <th className="px-3 py-2.5 text-right">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {shown.map((r, i) => (
              <tr key={`${r.method} ${r.url} ${String(i)}`} className="hover:bg-surface-2">
                <td className="px-3 py-2">
                  <span
                    className={`rounded-sm border px-1.5 py-0.5 ${STATUS_TONE[statusClass(r.status_code)]}`}
                  >
                    {r.status_code ?? '—'}
                  </span>
                </td>
                <td className="px-3 py-2 text-fg">{r.method ?? '—'}</td>
                <td className="max-w-[420px] truncate px-3 py-2 text-fg" title={r.url}>
                  {pathOf(r.url, i === 0 ? null : first)}
                </td>
                <td className="px-3 py-2 text-fg-muted">{r.remote_ip ?? '—'}</td>
                <td className="px-3 py-2 text-right text-fg-muted">
                  {r.size_bytes === null ? '—' : formatBytes(r.size_bytes)}
                </td>
                <td className="px-3 py-2 text-right text-fg-muted">
                  {r.duration_ms === null ? '—' : `${COUNT.format(r.duration_ms)}ms`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface-2 px-3 py-2 font-body-code text-caption text-fg-muted">
        <span className="flex items-center gap-2">
          Showing {all ? 'all' : `top ${String(shown.length)}`} of {COUNT.format(rows.length)}{' '}
          network events
          {rows.length > TOP && (
            <button
              type="button"
              aria-pressed={all}
              aria-label={all ? 'Show top 6 network events' : 'Show all network events'}
              onClick={() => setAll((on) => !on)}
              className={`rounded-sm px-1 text-primary hover:underline ${FOCUS}`}
            >
              {all ? 'Show top 6' : 'Show all'}
            </button>
          )}
        </span>
        <span>
          Total Payload: {formatBytes(bytes)} / Cumulative Time: {COUNT.format(ms)}ms
        </span>
      </div>
    </>
  );
}

function ConsoleList({ rows }: { rows: readonly ConsoleEntry[] }): ReactElement {
  if (rows.length === 0) {
    return (
      <p className="p-3 text-body-default text-fg-muted">No console messages were recorded.</p>
    );
  }
  return (
    <ol className="flex flex-col gap-1 bg-bg p-3 font-body-code text-caption">
      {rows.map((r, i) => (
        <li key={`${String(i)} ${r.message}`} className="flex gap-2 break-words">
          {r.at !== null && <span className="shrink-0 text-fg-muted">{formatMoment(r.at)}</span>}
          <span
            className={`shrink-0 font-semibold uppercase ${LEVEL_TONE[r.level] ?? 'text-fg-muted'}`}
          >
            [{r.level}]
          </span>
          <span className="min-w-0 text-fg">{r.message}</span>
        </li>
      ))}
    </ol>
  );
}

function cookieFlags(c: ScreenshotCookie): string {
  const flags = [
    c.http_only ? 'HttpOnly' : 'Client Readable',
    ...(c.secure ? ['Secure'] : []),
    ...(c.same_site === null ? [] : [`SameSite=${c.same_site}`]),
  ];
  return flags.join(' | ');
}

/** Names and flags only: the value of a target cookie is never stored nor shown (D1, G7). */
function CookieList({ rows }: { rows: readonly ScreenshotCookie[] }): ReactElement {
  if (rows.length === 0) {
    return <p className="p-3 text-body-default text-fg-muted">No cookies were set.</p>;
  }
  return (
    <ul className="divide-y divide-border font-body-code text-caption">
      {rows.map((c) => (
        <li
          key={`${c.name} ${c.domain ?? ''} ${c.path ?? ''}`}
          className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-semibold text-primary">{c.name}</span>
            <span className={c.http_only ? 'text-good' : 'text-warn'}>{cookieFlags(c)}</span>
          </span>
          <span className="text-fg-muted">
            {c.domain ?? 'Host only'} · {c.path ?? '/'} ·{' '}
            {c.expires === null ? 'Session' : `Expires ${formatMoment(c.expires)}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function CaptureTabs({
  screenshotId,
  rawOutputId,
  network,
  networkPending,
  networkFailed,
  consoleLog,
  cookies,
}: {
  screenshotId: string;
  /** null for a failed capture: no image raw output to download. */
  rawOutputId: string | null;
  network: readonly NetworkEntry[];
  networkPending: boolean;
  networkFailed: boolean;
  consoleLog: readonly ConsoleEntry[];
  cookies: readonly ScreenshotCookie[];
}): ReactElement {
  const [tab, setTab] = useState<TabId>('network');
  const refs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});
  const counts: Readonly<Record<TabId, number>> = {
    network: network.length,
    console: consoleLog.length,
    cookies: cookies.length,
  };

  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    event.stopPropagation();
    const at = TABS.findIndex((t) => t.id === tab);
    const step = event.key === 'ArrowRight' ? 1 : TABS.length - 1;
    const next = TABS[(at + step) % TABS.length];
    if (next === undefined) return;
    setTab(next.id);
    refs.current[next.id]?.focus();
  };

  return (
    <div className="flex w-full flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-md">
      <div className="flex items-center justify-between gap-1 overflow-x-auto border-b border-border bg-surface-2 p-1.5">
        <div
          role="tablist"
          aria-label="Capture telemetry"
          onKeyDown={onKeyDown}
          className="flex min-w-max items-center gap-1"
        >
          {TABS.map((t) => {
            const on = t.id === tab;
            return (
              <button
                key={t.id}
                ref={(el) => {
                  refs.current[t.id] = el;
                }}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={on}
                aria-controls={`panel-${t.id}`}
                tabIndex={on ? 0 : -1}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-caption font-semibold transition-colors ${FOCUS} ${
                  on
                    ? 'border border-border bg-surface text-primary shadow-sm'
                    : 'text-fg-muted hover:bg-surface-3 hover:text-fg'
                }`}
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[15px]">
                  {t.icon}
                </span>
                <span>{t.label}</span>
                <span className="rounded-full bg-surface-3 px-1.5 font-body-code text-[10px] text-fg-muted">
                  {COUNT.format(counts[t.id])}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 pr-2">
          <a
            href={screenshotHarUrl(screenshotId)}
            download
            className={`rounded-sm font-body-code text-caption text-fg-muted hover:text-primary ${FOCUS}`}
          >
            HAR 1.2 Export
          </a>
          {rawOutputId !== null && (
            <a
              href={rawOutputContentHref(rawOutputId)}
              download
              title="Export Raw Output"
              aria-label="Export Raw Output"
              className={`flex rounded-sm p-1 text-fg-muted hover:bg-surface-3 hover:text-fg ${FOCUS}`}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                file_download
              </span>
            </a>
          )}
        </div>
      </div>
      <div
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        className="flex flex-col"
      >
        {tab === 'network' && (
          <NetworkTable rows={network} pending={networkPending} failed={networkFailed} />
        )}
        {tab === 'console' && <ConsoleList rows={consoleLog} />}
        {tab === 'cookies' && <CookieList rows={cookies} />}
      </div>
    </div>
  );
}
