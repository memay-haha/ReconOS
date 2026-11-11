'use client';

import { type ReactElement, useState } from 'react';

import { formatMoment } from '@/lib/format-moment';
import type { ScreenshotTls } from '@/lib/screenshots';
import type { UrlTechnology } from '@/lib/url-detail';

const COUNT = new Intl.NumberFormat('en-US');
const DAY_MS = 86_400_000;

/** Bytes in the unit a reader expects, `42.8 KB`. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${COUNT.format(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/** The cookie names of a `Set-Cookie` header. The value may be a session token of the
 * target, so it never reaches the screen (G7). */
function cookieNames(value: unknown): string {
  const lines = Array.isArray(value) ? value : [value];
  return lines
    .map((line) => (typeof line === 'string' ? (line.split('=')[0] ?? '').trim() : ''))
    .filter((name) => name !== '')
    .join(', ');
}

/** A header value as text: headers arrive as JSON, so a value may be a list or a number. */
export function headerText(name: string, value: unknown): string {
  if (name.toLowerCase() === 'set-cookie') return cookieNames(value);
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((v) => (typeof v === 'string' ? v : '')).join(', ');
  return JSON.stringify(value);
}

/** The key headers S07 lists before "Show all" (M20). */
const KEY_HEADERS = [
  'server',
  'content-type',
  'strict-transport-security',
  'content-security-policy',
  'x-frame-options',
  'set-cookie',
] as const;

/** The response headers gowitness recorded. Untrusted target data: text only. */
export function HeaderList({
  headers,
}: {
  headers: Readonly<Record<string, unknown>> | null;
}): ReactElement {
  const [all, setAll] = useState(false);
  const entries = Object.entries(headers ?? {});
  if (entries.length === 0) {
    return <p className="text-body-default text-fg-muted">No response headers were recorded.</p>;
  }
  const key = entries.filter(([name]) =>
    (KEY_HEADERS as readonly string[]).includes(name.toLowerCase()),
  );
  const shown = all ? entries : key;
  return (
    <div className="overflow-hidden rounded-sm border border-border bg-surface-2">
      <div className="flex items-center justify-between gap-2 bg-surface-3 px-3 py-1.5 text-label-caps uppercase text-fg-muted">
        <span className="font-semibold">Key HTTP Headers</span>
        <span className="flex items-center gap-2">
          <span className="font-body-code text-[10px]">
            {COUNT.format(shown.length)} of {COUNT.format(entries.length)} shown
          </span>
          {key.length < entries.length && (
            <button
              type="button"
              aria-pressed={all}
              aria-label={all ? 'Show key headers only' : 'Show all headers'}
              onClick={() => setAll((on) => !on)}
              className="rounded-sm px-1 font-body-code text-[10px] normal-case text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {all ? 'Show key headers' : 'Show all'}
            </button>
          )}
        </span>
      </div>
      <dl className="grid grid-cols-1 gap-2 p-2.5 font-body-code text-caption md:grid-cols-2 lg:grid-cols-3">
        {shown.map(([name, value]) => (
          <div
            key={name}
            data-header
            className="flex min-w-0 flex-col rounded-sm border border-border bg-surface p-1.5"
          >
            <dt className="break-all text-[11px] font-semibold text-primary">{name}</dt>
            <dd className="truncate text-fg" title={headerText(name, value)}>
              {headerText(name, value)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Short names the mockup prints for the five security headers (M19). Any other key the
 * backend sends shows under its own name. */
const SHORT: Readonly<Record<string, string>> = {
  'strict-transport-security': 'HSTS',
  'content-security-policy': 'CSP',
  'x-frame-options': 'X-Frame-Options',
  'x-content-type-options': 'X-Content-Type',
  'permissions-policy': 'Permissions-Policy',
};

function headerValue(
  headers: Readonly<Record<string, unknown>> | null,
  name: string,
): string | null {
  const found = Object.entries(headers ?? {}).find(([k]) => k.toLowerCase() === name);
  return found === undefined ? null : headerText(found[0], found[1]);
}

/** Presence of the five security headers, as the backend counted them (M19). */
export function SecurityHeaders({
  checks,
  headers,
}: {
  checks: Readonly<Record<string, boolean>>;
  headers: Readonly<Record<string, unknown>> | null;
}): ReactElement {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
      {Object.entries(checks).map(([name, present]) => {
        const value = headerValue(headers, name.toLowerCase());
        return (
          <div
            key={name}
            className={`flex min-w-0 items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-caption ${
              present
                ? 'border-good-bd bg-good-soft text-good'
                : 'border-crit-bd bg-crit-soft text-crit'
            }`}
          >
            <span aria-hidden="true" className="material-symbols-outlined shrink-0 text-[14px]">
              {present ? 'check_circle' : 'cancel'}
            </span>
            <span className="shrink-0 font-semibold">{SHORT[name.toLowerCase()] ?? name}:</span>
            <span className="truncate font-body-code text-fg" title={value ?? undefined}>
              {present ? (value ?? 'Present') : 'Missing'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function TechnologyGrid({
  technologies,
}: {
  technologies: readonly UrlTechnology[];
}): ReactElement {
  if (technologies.length === 0) {
    return <p className="text-body-default text-fg-muted">No technologies detected on this URL.</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
      {technologies.map((t) => (
        <div
          key={t.technology_id}
          data-technology
          className="flex min-w-0 flex-col rounded-sm border border-border bg-surface-2 p-2 transition-colors hover:bg-surface-3"
        >
          <div className="mb-1.5 flex items-center justify-between gap-1">
            {/* Two-letter monogram, as the mockup marks each technology. */}
            <span
              aria-hidden="true"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border border-border bg-surface font-body-code text-[10px] font-semibold text-primary"
            >
              {t.name.slice(0, 2)}
            </span>
            <span className="truncate text-[10px] text-fg-muted">
              {t.category ?? 'Uncategorised'}
            </span>
          </div>
          <span className="truncate text-body-default font-medium text-fg">{t.name}</span>
          <span className="truncate font-body-code text-caption text-fg-muted">
            {t.version ?? 'Version unknown'}
          </span>
        </div>
      ))}
    </div>
  );
}

const TLS_CELL =
  'flex min-w-0 flex-col justify-between gap-1 rounded-sm border border-border bg-surface-2 p-2 sm:flex-row sm:items-center';
const TLS_LABEL = 'shrink-0 text-label-caps uppercase text-fg-muted';

/** Days until `notAfter`, for the expiry chip; negative once expired. */
function daysLeft(notAfter: string, now: number): number {
  return Math.floor((Date.parse(notAfter) - now) / DAY_MS);
}

/** The certificate gowitness saw. Every field comes from the target: text only. */
export function TlsPanel({ tls }: { tls: ScreenshotTls | null }): ReactElement {
  // Read once per mount: the expiry chip counts whole days, so it need not tick.
  const [now] = useState(() => Date.now());
  if (tls === null) {
    return (
      <p className="text-body-default text-fg-muted">No TLS session was recorded for this page.</p>
    );
  }
  const left = tls.not_after === null ? null : daysLeft(tls.not_after, now);
  return (
    <div className="flex flex-col gap-space-md">
      <div className="grid grid-cols-1 gap-2 text-caption sm:grid-cols-2 lg:grid-cols-4">
        <div className={TLS_CELL}>
          <span className={TLS_LABEL}>Subject</span>
          <span className="truncate font-body-code font-semibold text-fg">
            {tls.subject ?? 'Unknown'}
          </span>
        </div>
        <div className={TLS_CELL}>
          <span className={TLS_LABEL}>Issuer</span>
          <span className="truncate font-body-code text-fg-muted">{tls.issuer ?? 'Unknown'}</span>
        </div>
        <div className={TLS_CELL}>
          <span className={TLS_LABEL}>Protocol &amp; Cipher</span>
          <span className="truncate font-body-code text-fg-muted">
            {[tls.protocol, tls.cipher].filter((v) => v !== null).join(' / ') || 'Unknown'}
          </span>
        </div>
        <div className={TLS_CELL}>
          <span className={TLS_LABEL}>Validity Window</span>
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-body-code text-fg-muted">
              {tls.not_before === null ? '?' : formatMoment(tls.not_before).slice(0, 10)} to{' '}
              {tls.not_after === null ? '?' : formatMoment(tls.not_after).slice(0, 10)}
            </span>
            {left !== null && (
              <span
                className={`rounded-sm border px-1.5 font-body-code ${
                  left < 0
                    ? 'border-crit-bd bg-crit-soft text-crit'
                    : left <= 30
                      ? 'border-warn-bd bg-warn-soft text-warn'
                      : 'border-good-bd bg-good-soft text-good'
                }`}
              >
                {left < 0 ? 'Expired' : `Expires in ${String(left)} days`}
              </span>
            )}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-caption">
        <span className={TLS_LABEL}>Subject Alt Names (SANs):</span>
        {tls.san.length === 0 && <span className="text-fg-muted">None</span>}
        <span className="flex flex-wrap gap-1">
          {tls.san.map((name) => (
            <span
              key={name}
              className="rounded-sm border border-border bg-surface-3 px-2 py-0.5 font-body-code text-fg"
            >
              {name}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}
