'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { type ReactElement, useState } from 'react';

import { ApiError } from '@/lib/api-client';
import { formatMoment } from '@/lib/format-moment';
import { neighboursInCache, screenshotImageUrl, useScreenshot } from '@/lib/screenshots';
import { httpHref, useUrlDetail } from '@/lib/url-detail';

import { STATUS_DOT, STATUS_TONE, statusClass, statusText } from '../http-status';

import { formatBytes, HeaderList, TechnologyGrid } from './detail-panels';

const FOCUS = 'focus:outline-none focus:ring-2 focus:ring-ring';
const BACK_LINK = `inline-flex items-center gap-1.5 rounded-sm bg-surface px-2.5 py-1.5 text-caption text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg ${FOCUS}`;
const STEP_BUTTON = `inline-flex items-center gap-1 rounded-sm bg-surface px-2 py-1 text-caption text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS}`;
const LIVE_BUTTON = `inline-flex items-center gap-1.5 rounded-sm bg-surface px-3 py-1.5 text-caption text-fg transition-colors hover:bg-surface-3 ${FOCUS}`;
const DOWNLOAD_BUTTON = `inline-flex items-center gap-1.5 rounded-sm bg-surface-3 px-3 py-1.5 text-caption font-semibold text-primary transition-colors hover:bg-surface-bright ${FOCUS}`;
const PANEL =
  'flex flex-col gap-space-md rounded-lg border border-border bg-surface p-space-lg shadow-md';
const PANEL_TITLE = 'text-panel-title uppercase tracking-wider text-fg';
const LIVE_LINK = `inline-flex items-center gap-1 text-caption text-fg-muted transition-colors hover:text-primary ${FOCUS}`;
const PNG_LINK = `inline-flex items-center gap-1 text-caption text-primary hover:underline ${FOCUS}`;
const TILE =
  'flex min-w-0 flex-col gap-1 rounded-sm border border-border bg-surface p-2.5 shadow-sm';
const TILE_LABEL = 'truncate text-label-caps uppercase tracking-wider text-fg-muted';
const TILE_VALUE = 'break-all font-body-code text-body-code text-fg';

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

export default function ScreenshotDetailPage(): ReactElement {
  const params = useParams<{ screenshotId: string }>();
  const screenshotId = params.screenshotId;
  const router = useRouter();
  const client = useQueryClient();
  const shot = useScreenshot(screenshotId);
  const url = useUrlDetail(shot.data?.url_id ?? null);
  const [copied, setCopied] = useState(false);
  // Prev and Next walk the gallery page the reader came from; opened from a link, there is none.
  const around = neighboursInCache(client, screenshotId);

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
  const contentLength = url.data?.content_length;
  const tone = statusClass(data.status_code);

  const copy = () => {
    if (data.final_url === null) return;
    void navigator.clipboard?.writeText(data.final_url).then(() => setCopied(true));
  };

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
                disabled={around.previous === null}
                onClick={() =>
                  around.previous !== null &&
                  router.push(`/screenshots/${encodeURIComponent(around.previous)}`)
                }
                className={STEP_BUTTON}
              >
                <Icon name="chevron_left" />
                <span>Previous</span>
              </button>
              <button
                type="button"
                disabled={around.next === null}
                onClick={() =>
                  around.next !== null &&
                  router.push(`/screenshots/${encodeURIComponent(around.next)}`)
                }
                className={STEP_BUTTON}
              >
                <span>Next</span>
                <Icon name="chevron_right" />
              </button>
            </div>
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
                className="material-symbols-outlined text-[14px] text-fg-faint"
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
            <div className="overflow-hidden rounded-sm border border-border bg-bg shadow-sm">
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
                // The image is streamed by Backend API; next/image would proxy it through Next.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={image}
                  alt={`Screenshot of ${finalUrl}`}
                  className="w-full object-contain object-top"
                />
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
                <p className="break-words text-body-default text-fg">
                  {data.title ?? (data.is_failed ? 'Screenshot failed' : 'Untitled page')}
                </p>
              </div>
              <div className="flex flex-col gap-2.5">
                <dl className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <div className={TILE}>
                    <dt className={TILE_LABEL}>Final URL</dt>
                    <dd className={TILE_VALUE}>{finalUrl}</dd>
                  </div>
                  <div className={TILE}>
                    <dt className={TILE_LABEL}>HTTP status</dt>
                    <dd className={TILE_VALUE}>
                      {data.status_code === null ? 'None' : String(data.status_code)}
                    </dd>
                  </div>
                  <div className={TILE}>
                    <dt className={TILE_LABEL}>Content length</dt>
                    <dd className={TILE_VALUE}>
                      {url.isError
                        ? 'Unavailable'
                        : contentLength === undefined
                          ? 'Loading…'
                          : contentLength === null
                            ? 'Unknown'
                            : formatBytes(contentLength)}
                    </dd>
                  </div>
                  <div className={TILE}>
                    <dt className={TILE_LABEL}>Taken at</dt>
                    <dd className={TILE_VALUE}>{formatMoment(data.captured_at)}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className={PANEL}>
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-good">
              security
            </span>
            <h3 className={PANEL_TITLE}>Response Headers</h3>
          </div>
          <HeaderList headers={data.http_headers} />
        </div>

        <div className={PANEL}>
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-primary">
              memory
            </span>
            <h2 className={PANEL_TITLE}>
              Detected Technologies
              {url.data !== undefined && ` (${url.data.technologies.length})`}
            </h2>
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
      </div>
    </div>
  );
}
