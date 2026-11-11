'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { type ReactElement, useEffect, useState } from 'react';

import { ApiError } from '@/lib/api-client';
import { useMe } from '@/lib/auth';
import { formatMoment } from '@/lib/format-moment';
import {
  neighboursInCache,
  screenshotImageUrl,
  useDeleteScreenshot,
  useScreenshot,
  useScreenshotNetwork,
} from '@/lib/screenshots';
import { httpHref, useUrlDetail } from '@/lib/url-detail';

import { STATUS_DOT, STATUS_TONE, statusClass, statusText } from '../http-status';

import { CaptureTabs } from './capture-tabs';
import {
  formatBytes,
  HeaderList,
  SecurityHeaders,
  TechnologyGrid,
  TlsPanel,
} from './detail-panels';
import { DeleteDialog, HtmlSourceDialog } from './dialogs';

const COUNT = new Intl.NumberFormat('en-US');
const FOCUS = 'focus:outline-none focus:ring-2 focus:ring-ring';
const BACK_LINK = `inline-flex items-center gap-1.5 rounded-sm bg-surface px-2.5 py-1.5 text-caption text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg ${FOCUS}`;
const STEP_BUTTON = `inline-flex items-center gap-1 rounded-sm bg-surface px-2 py-1 text-caption text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS}`;
const KBD = 'rounded-sm bg-surface-2 px-1 font-body-code text-caption text-fg-muted';
const LIVE_BUTTON = `inline-flex items-center gap-1.5 rounded-sm bg-surface px-3 py-1.5 text-caption text-fg transition-colors hover:bg-surface-3 ${FOCUS}`;
const DOWNLOAD_BUTTON = `inline-flex items-center gap-1.5 rounded-sm bg-surface-3 px-3 py-1.5 text-caption font-semibold text-primary transition-colors hover:bg-surface-bright ${FOCUS}`;
const DELETE_BUTTON = `inline-flex items-center gap-1 rounded-sm bg-crit-soft px-2.5 py-1.5 text-caption text-crit transition-colors hover:bg-crit/20 ${FOCUS}`;
const PANEL =
  'flex flex-col gap-space-md rounded-lg border border-border bg-surface p-space-lg shadow-md';
const PANEL_TITLE = 'text-panel-title uppercase tracking-wider text-fg';
const LIVE_LINK = `inline-flex items-center gap-1 text-caption text-fg-muted transition-colors hover:text-primary ${FOCUS}`;
const PNG_LINK = `inline-flex items-center gap-1 text-caption text-primary hover:underline ${FOCUS}`;
const TILE =
  'flex min-w-0 flex-col gap-1 rounded-sm border border-border bg-surface p-2.5 shadow-sm';
const TILE_SMALL =
  'flex min-w-0 flex-col gap-0.5 rounded-sm border border-border bg-surface p-2 shadow-sm';
const TILE_LABEL = 'truncate text-label-caps uppercase tracking-wider text-fg-muted';
const TILE_SUB = 'truncate font-body-code text-caption text-fg-muted';

/** The mockup sizes each icon by hand: 14, 15 and 16 px. */
const ICON_SIZE = {
  sm: 'text-[14px]',
  md: 'text-[15px]',
  lg: 'text-[16px]',
} as const;

function Icon({
  name,
  size = 'sm',
}: {
  name: string;
  size?: keyof typeof ICON_SIZE;
}): ReactElement {
  return (
    <span aria-hidden="true" className={`material-symbols-outlined ${ICON_SIZE[size]}`}>
      {name}
    </span>
  );
}

/** Host and path of a URL, as the mockup's URL pill prints it. */
function hostAndPath(href: string): string {
  try {
    const u = new URL(href);
    return `${u.host}${u.pathname === '/' ? '' : u.pathname}`;
  } catch {
    return href;
  }
}

function hostOf(href: string | null): string {
  if (href === null) return 'unknown host';
  try {
    return new URL(href).host;
  } catch {
    return href;
  }
}

/** "1920×1080 @ 2x", or null when gowitness did not record the viewport. */
function resolution(width: number | null, height: number | null, scale: number | null) {
  if (width === null || height === null) return null;
  return `${String(width)}×${String(height)}${scale === null ? '' : ` @ ${String(scale)}x`}`;
}

/** The 1-based place the gallery gave this screenshot, from `?at=`. */
function positionOf(raw: string | null): number | null {
  const n = raw === null ? Number.NaN : Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export default function ScreenshotDetailPage(): ReactElement {
  const params = useParams<{ screenshotId: string }>();
  const screenshotId = params.screenshotId;
  const search = useSearchParams();
  const router = useRouter();
  const client = useQueryClient();
  const me = useMe();
  const shot = useScreenshot(screenshotId);
  const network = useScreenshotNetwork(screenshotId);
  const url = useUrlDetail(shot.data?.url_id ?? null);
  const remove = useDeleteScreenshot();
  const [copied, setCopied] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Prev and Next walk the gallery page the reader came from; opened from a link, there is none.
  const around = neighboursInCache(client, screenshotId);
  const position = positionOf(search?.get('at') ?? null);
  const canDelete = me.data?.role === 'superadmin' || me.data?.role === 'admin';

  const go = (id: string | null, step: number) => {
    if (id === null) return;
    const at = position === null ? '' : `?at=${String(position + step)}`;
    router.push(`/screenshots/${encodeURIComponent(id)}${at}`);
  };

  // Left and Right walk the gallery, as the mockup's key hints promise. A listener only.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (sourceOpen || deleteOpen || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.closest('input, textarea, select, [role="tablist"]') !== null ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === 'ArrowLeft' && around.previous !== null) {
        event.preventDefault();
        go(around.previous, -1);
      } else if (event.key === 'ArrowRight' && around.next !== null) {
        event.preventDefault();
        go(around.next, 1);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  });

  const back = (
    <Link href="/screenshots" className={BACK_LINK}>
      <Icon name="arrow_back" size="md" />
      <span>Back to Gallery</span>
    </Link>
  );

  if (shot.isPending) {
    return (
      <div className="flex w-full flex-col gap-space-lg p-margin">
        {back}
        <p className="text-body-default text-fg-muted">Loading the screenshot…</p>
      </div>
    );
  }
  if (shot.isError) {
    const missing = shot.error instanceof ApiError && shot.error.status === 404;
    return (
      <div className="flex w-full flex-col gap-space-lg p-margin">
        {back}
        <p role="alert" className="text-body-default text-crit">
          {missing
            ? 'This screenshot does not exist, or you cannot see it.'
            : 'Could not load the screenshot.'}
        </p>
      </div>
    );
  }

  const data = shot.data;
  const live = httpHref(data.final_url);
  const finalUrl = data.final_url ?? 'No final URL';
  const image = screenshotImageUrl(data.id);
  const tone = statusClass(data.status_code);
  const viewport = resolution(data.width, data.height, data.device_scale);
  const requests = network.data ?? [];
  const okRequests = requests.filter((r) => statusClass(r.status_code) === 'ok').length;
  const warnings = data.console_log.filter((l) => l.level === 'warn' || l.level === 'error').length;
  const headerCount = Object.keys(data.http_headers ?? {}).length;
  const techCount = url.data?.technologies.length ?? data.technologies.length;
  const httpOnly = data.cookies.filter((c) => c.http_only).length;
  const hardened = data.security_headers_passed === data.security_headers_total;

  const copy = () => {
    if (data.final_url === null) return;
    void navigator.clipboard?.writeText(data.final_url).then(() => setCopied(true));
  };

  const confirmDelete = () =>
    remove.mutate(data.id, {
      onSuccess: () => {
        setDeleteOpen(false);
        router.push('/screenshots');
      },
    });

  return (
    <div className="flex w-full flex-col pb-12 text-fg">
      <div className="flex w-full flex-wrap items-center justify-between gap-space-md bg-surface-2 px-margin py-2.5 shadow-sm">
        <div className="flex min-w-0 flex-wrap items-center gap-space-sm sm:gap-space-md">
          {back}
          <span
            aria-hidden="true"
            className="hidden h-4 w-1.5 rounded-full bg-surface-3 sm:block"
          />
          {around.found && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                title="Previous screenshot (Left Arrow)"
                aria-keyshortcuts="ArrowLeft"
                disabled={around.previous === null}
                onClick={() => go(around.previous, -1)}
                className={STEP_BUTTON}
              >
                <Icon name="chevron_left" />
                <span>Prev</span>
                <kbd aria-hidden="true" className={KBD}>
                  ←
                </kbd>
              </button>
              <button
                type="button"
                title="Next screenshot (Right Arrow)"
                aria-keyshortcuts="ArrowRight"
                disabled={around.next === null}
                onClick={() => go(around.next, 1)}
                className={STEP_BUTTON}
              >
                <span>Next</span>
                <kbd aria-hidden="true" className={KBD}>
                  →
                </kbd>
                <Icon name="chevron_right" />
              </button>
            </div>
          )}
          {around.found && position !== null && (
            <span className="rounded-sm bg-surface-3 px-2 py-0.5 font-body-code text-caption text-fg-muted">
              <span className="font-semibold text-fg">{COUNT.format(position)}</span> /{' '}
              {COUNT.format(around.total)} screenshots
            </span>
          )}
          {data.final_url !== null && (
            <span className="hidden max-w-[280px] items-center gap-1.5 rounded-sm bg-neutral-soft px-2.5 py-0.5 font-body-code text-caption text-fg-muted md:flex lg:max-w-md">
              <span
                aria-hidden="true"
                className="material-symbols-outlined shrink-0 text-[14px] text-primary"
              >
                public
              </span>
              <span className="truncate">{hostAndPath(data.final_url)}</span>
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-space-sm">
          {live !== null && (
            <a href={live} target="_blank" rel="noopener noreferrer" className={LIVE_BUTTON}>
              <span>Open Live URL</span>
              <span
                aria-hidden="true"
                className="material-symbols-outlined text-[14px] text-fg-muted"
              >
                open_in_new
              </span>
            </a>
          )}
          {!data.is_failed && (
            <a href={image} download className={DOWNLOAD_BUTTON}>
              <Icon name="download" size="md" />
              <span>Download PNG</span>
            </a>
          )}
          {canDelete && (
            <button type="button" onClick={() => setDeleteOpen(true)} className={DELETE_BUTTON}>
              <Icon name="delete" size="md" />
              <span>Delete Screenshot</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-5 p-margin">
        <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-12">
          <div className={`lg:col-span-6 ${PANEL}`}>
            <div className="flex items-center justify-between gap-space-sm">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined text-[18px] text-primary"
                >
                  photo_camera
                </span>
                <h2 className={PANEL_TITLE}>Screenshot Preview</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-body-code text-caption text-fg-muted">
                  Viewport{viewport === null ? '' : ` ${viewport}`}
                </span>
                <span aria-hidden="true" className="h-3 w-px bg-border" />
                {live !== null && (
                  <a
                    href={live}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open the live page in a new tab"
                    className={LIVE_LINK}
                  >
                    <Icon name="open_in_new" />
                    <span>Live</span>
                  </a>
                )}
                {!data.is_failed && (
                  <a
                    href={image}
                    download
                    aria-label="Download the screenshot as PNG"
                    className={PNG_LINK}
                  >
                    <Icon name="download" />
                    <span>PNG</span>
                  </a>
                )}
              </div>
            </div>
            <div className="relative overflow-hidden rounded-sm border border-border bg-bg shadow-sm">
              {/* Window chrome around the image, as the mockup frames the page. */}
              <div className="flex h-6 items-center justify-between border-b border-border bg-surface-2 px-3">
                <span aria-hidden="true" className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-crit/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-warn/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-good/70" />
                </span>
                <span className="max-w-[200px] truncate text-caption text-fg-muted">
                  {data.title ?? ''}
                </span>
                <span aria-hidden="true" className="w-6" />
              </div>
              {data.is_failed ? (
                <div className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-space-sm bg-crit-soft p-space-md">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full border border-crit-bd bg-crit/20 text-crit">
                    <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
                      sync_problem
                    </span>
                  </span>
                  <p className="break-words text-center font-body-code text-body-code text-crit">
                    {data.error_message ?? 'The screenshot failed with no error message.'}
                  </p>
                </div>
              ) : (
                <div className="relative">
                  {/* The image is streamed by Backend API; next/image would proxy it through Next. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image}
                    alt={`Screenshot of ${finalUrl}`}
                    className="w-full object-contain object-top"
                  />
                  <span
                    className={`absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 font-body-code text-caption font-semibold shadow-sm ${STATUS_TONE[tone]}`}
                  >
                    <span
                      aria-hidden="true"
                      className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[tone]}`}
                    />
                    HTTP {statusText(data.status_code)}
                  </span>
                  {viewport !== null && (
                    <span className="absolute bottom-2.5 right-2.5 rounded-sm border border-border bg-surface px-2 py-0.5 font-body-code text-caption text-fg-muted shadow-sm">
                      {viewport}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 rounded-sm border border-border bg-surface-2 p-2">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`material-symbols-outlined shrink-0 text-[16px] ${
                    finalUrl.startsWith('https://') ? 'text-good' : 'text-fg-muted'
                  }`}
                >
                  {finalUrl.startsWith('https://') ? 'lock' : 'lock_open'}
                </span>
                <span
                  className="min-w-0 truncate font-body-code text-caption text-fg-muted"
                  title={finalUrl}
                >
                  {finalUrl}
                </span>
              </div>
              <button
                type="button"
                onClick={copy}
                disabled={data.final_url === null}
                aria-label={copied ? 'URL copied' : 'Copy URL'}
                className={`shrink-0 rounded-sm p-1 text-fg-muted transition-colors hover:bg-surface-3 hover:text-primary ${FOCUS}`}
              >
                <Icon name={copied ? 'check' : 'content_copy'} size="lg" />
              </button>
            </div>
          </div>

          <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-md lg:col-span-6">
            <div className="flex flex-1 flex-col justify-between gap-space-md bg-gradient-to-r from-good-soft via-info-soft to-surface-2 p-space-lg">
              <div className="flex flex-col gap-space-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <h1 className="text-headline-lg tracking-tight text-fg">Screenshot Detail</h1>
                    {!data.is_failed && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-sm border px-2.5 py-0.5 font-body-code text-caption font-semibold ${STATUS_TONE[tone]}`}
                      >
                        <span
                          aria-hidden="true"
                          className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[tone]}`}
                        />
                        HTTP {statusText(data.status_code)}
                      </span>
                    )}
                  </div>
                  <span className="break-all font-body-code text-caption text-fg-muted">
                    ID: {data.id}
                  </span>
                </div>
                <p className="break-words text-body-default font-medium text-fg">
                  {data.title ?? (data.is_failed ? 'Screenshot failed' : 'Untitled page')}
                </p>
                <p className="break-words text-body-default leading-relaxed text-fg">
                  <span className="text-fg-muted">The final URL was </span>
                  <code className="rounded-sm border border-border bg-surface px-1.5 py-0.5 font-body-code text-primary">
                    {finalUrl}
                  </code>
                  {data.is_failed ? (
                    <span className="text-fg-muted"> and the screenshot failed.</span>
                  ) : (
                    <>
                      <span className="text-fg-muted"> responding with </span>
                      <strong className="font-semibold text-fg">
                        HTTP {data.status_code ?? 'unknown'}
                      </strong>
                      {data.html_size !== null && (
                        <>
                          <span className="text-fg-muted"> and </span>
                          <span className="font-body-code font-semibold text-fg">
                            {formatBytes(data.html_size)}
                          </span>
                          <span className="text-fg-muted"> of rendered content</span>
                        </>
                      )}
                      <span className="text-fg-muted">.</span>
                    </>
                  )}
                  {data.duration_ms !== null && (
                    <>
                      <span className="text-fg-muted"> Screenshot taken in </span>
                      <span className="font-body-code font-semibold text-primary">
                        {(data.duration_ms / 1000).toFixed(2)} seconds
                      </span>
                      <span className="text-fg-muted">.</span>
                    </>
                  )}
                </p>
              </div>
              <div className="flex flex-col gap-2.5">
                <dl className="grid grid-cols-2 gap-2.5">
                  <div className={TILE}>
                    <dt className="flex items-center justify-between">
                      <span className={TILE_LABEL}>Requests</span>
                      <span className="text-fg-muted">
                        <Icon name="swap_calls" size="lg" />
                      </span>
                    </dt>
                    <dd className="flex items-baseline gap-1.5">
                      <span className="text-[24px] leading-none text-fg">
                        {network.isPending ? '…' : COUNT.format(requests.length)}
                      </span>
                      <span className={TILE_SUB}>{COUNT.format(okRequests)} 2xx OK</span>
                    </dd>
                  </div>
                  <div className={TILE}>
                    <dt className="flex items-center justify-between">
                      <span className={TILE_LABEL}>Logs</span>
                      <span className="text-warn">
                        <Icon name="terminal" size="lg" />
                      </span>
                    </dt>
                    <dd className="flex items-baseline gap-1.5">
                      <span className="text-[24px] leading-none text-warn">
                        {COUNT.format(data.console_log.length)}
                      </span>
                      <span className={TILE_SUB}>{COUNT.format(warnings)} warn</span>
                    </dd>
                  </div>
                </dl>
                <dl className="grid grid-cols-3 gap-2.5">
                  <div className={TILE_SMALL}>
                    <dt className="flex items-center justify-between">
                      <span className={TILE_LABEL}>Headers</span>
                      <span className="text-fg-muted">
                        <Icon name="data_object" />
                      </span>
                    </dt>
                    <dd className="flex items-baseline gap-1">
                      <span className="text-[20px] leading-none text-fg">
                        {COUNT.format(headerCount)}
                      </span>
                      <span className={TILE_SUB}>resp</span>
                    </dd>
                  </div>
                  <div className={TILE_SMALL}>
                    <dt className="flex items-center justify-between">
                      <span className={TILE_LABEL}>Tech</span>
                      <span className="text-primary">
                        <Icon name="layers" />
                      </span>
                    </dt>
                    <dd className="flex items-baseline gap-1">
                      <span className="text-[20px] leading-none text-primary">
                        {COUNT.format(techCount)}
                      </span>
                      <span className={TILE_SUB}>libs</span>
                    </dd>
                  </div>
                  <div className={TILE_SMALL}>
                    <dt className="flex items-center justify-between">
                      <span className={TILE_LABEL}>Cookies</span>
                      <span className="text-fg-muted">
                        <Icon name="cookie" />
                      </span>
                    </dt>
                    <dd className="flex items-baseline gap-1">
                      <span className="text-[20px] leading-none text-fg">
                        {COUNT.format(data.cookies.length)}
                      </span>
                      <span className={TILE_SUB}>{COUNT.format(httpOnly)} HttpOnly</span>
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface-2 px-space-lg py-2 text-caption text-fg-muted">
              <span className="flex items-center gap-1.5">
                <span className="text-primary">
                  <Icon name="schedule" />
                </span>
                <span>
                  Taken {formatMoment(data.captured_at)}
                  {data.worker_name !== null && (
                    <>
                      {' '}
                      by worker{' '}
                      <span className="font-body-code font-medium text-fg">{data.worker_name}</span>
                    </>
                  )}
                </span>
              </span>
              {data.remote_ip !== null && (
                <span className="rounded-sm bg-surface-3 px-1.5 font-body-code text-[11px] text-fg-muted">
                  {data.remote_ip}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className={PANEL}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-good">
                security
              </span>
              <h3 className={PANEL_TITLE}>Response Security Headers Check</h3>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`rounded-sm border px-2 py-0.5 font-body-code text-caption font-semibold ${
                  hardened
                    ? 'border-good-bd bg-good-soft text-good'
                    : 'border-warn-bd bg-warn-soft text-warn'
                }`}
              >
                {data.security_headers_passed} / {data.security_headers_total}{' '}
                {hardened ? 'Hardened' : 'Present'}
              </span>
              <span className="font-body-code text-caption text-fg-muted">RFC 6797 / RFC 7034</span>
            </div>
          </div>
          <SecurityHeaders checks={data.security_headers} headers={data.http_headers} />
          <HeaderList headers={data.http_headers} />
        </div>

        <div className={PANEL}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="material-symbols-outlined text-[18px] text-primary"
              >
                memory
              </span>
              <h2 className={PANEL_TITLE}>
                Detected Technologies
                {url.data !== undefined && ` (${String(url.data.technologies.length)})`}
              </h2>
            </div>
            {data.html_size !== null && (
              <button
                type="button"
                onClick={() => setSourceOpen(true)}
                className={`inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface-2 px-3 py-1 text-caption text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg ${FOCUS}`}
              >
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined text-[15px] text-primary"
                >
                  html
                </span>
                <span>View Page HTML Source ({formatBytes(data.html_size)})</span>
              </button>
            )}
          </div>
          {url.isPending && (
            <p className="text-body-default text-fg-muted">Loading the technologies…</p>
          )}
          {url.isError && (
            <p role="alert" className="text-body-default text-crit">
              Could not load the technologies of this URL.
            </p>
          )}
          {url.data !== undefined && <TechnologyGrid technologies={url.data.technologies} />}
        </div>

        <div className="flex flex-col gap-5">
          <div className={`w-full ${PANEL}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined text-[18px] text-good"
                >
                  verified_user
                </span>
                <h2 className={PANEL_TITLE}>TLS / Certificate</h2>
              </div>
              {data.tls?.protocol != null && (
                <span className="rounded-sm border border-good-bd bg-good-soft px-2 py-0.5 font-body-code text-caption text-good">
                  {data.tls.protocol}
                </span>
              )}
            </div>
            <TlsPanel tls={data.tls} />
          </div>
          <CaptureTabs
            screenshotId={data.id}
            rawOutputId={data.raw_output_id}
            network={requests}
            networkPending={network.isPending}
            networkFailed={network.isError}
            consoleLog={data.console_log}
            cookies={data.cookies}
          />
        </div>
      </div>

      {sourceOpen && (
        <HtmlSourceDialog
          screenshotId={data.id}
          host={hostOf(data.final_url)}
          size={data.html_size}
          sha256={data.html_sha256}
          onClose={() => setSourceOpen(false)}
        />
      )}
      {deleteOpen && (
        <DeleteDialog
          pending={remove.isPending}
          failed={remove.isError}
          onConfirm={confirmDelete}
          onClose={() => setDeleteOpen(false)}
        />
      )}
    </div>
  );
}
