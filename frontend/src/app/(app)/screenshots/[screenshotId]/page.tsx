'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { type ReactElement, useState } from 'react';

import { ApiError } from '@/lib/api-client';
import { formatMoment } from '@/lib/format-moment';
import { neighboursInCache, screenshotImageUrl, useScreenshot } from '@/lib/screenshots';
import { httpHref, useUrlDetail } from '@/lib/url-detail';

import { formatBytes, HeaderList, TechnologyGrid } from './detail-panels';

const BAR_BUTTON =
  'inline-flex items-center gap-space-xs rounded-sm bg-surface px-space-sm py-space-xs text-body-default text-fg hover:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60';
const PANEL = 'flex flex-col gap-space-md rounded-sm border border-border bg-surface p-space-lg';
const SMALL_LINK =
  'inline-flex items-center gap-space-xs text-caption text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-ring';

function Icon({ name }: { name: string }): ReactElement {
  return (
    <span aria-hidden="true" className="material-symbols-outlined text-icon">
      {name}
    </span>
  );
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
    <Link href="/screenshots" className={BAR_BUTTON}>
      <Icon name="arrow_back" />
      <span>Back to Gallery</span>
    </Link>
  );

  if (shot.isPending) {
    return (
      <div className="flex w-full flex-col gap-space-lg p-space-lg">
        {back}
        <p className="text-body-default text-fg-muted">Loading the screenshot…</p>
      </div>
    );
  }
  if (shot.isError) {
    const missing = shot.error instanceof ApiError && shot.error.status === 404;
    return (
      <div className="flex w-full flex-col gap-space-lg p-space-lg">
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

  const copy = () => {
    if (data.final_url === null) return;
    void navigator.clipboard?.writeText(data.final_url).then(() => setCopied(true));
  };

  return (
    <div className="flex w-full flex-col pb-space-xl text-fg">
      <div className="flex w-full flex-wrap items-center justify-between gap-space-sm bg-surface-2 px-space-lg py-space-sm">
        <div className="flex min-w-0 flex-wrap items-center gap-space-sm">
          {back}
          {around.found && (
            <>
              <button
                type="button"
                disabled={around.previous === null}
                onClick={() =>
                  around.previous !== null &&
                  router.push(`/screenshots/${encodeURIComponent(around.previous)}`)
                }
                className={BAR_BUTTON}
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
                className={BAR_BUTTON}
              >
                <span>Next</span>
                <Icon name="chevron_right" />
              </button>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-space-sm">
          {live !== null && (
            <a href={live} target="_blank" rel="noopener noreferrer" className={BAR_BUTTON}>
              <span>Open Live URL</span>
              <Icon name="open_in_new" />
            </a>
          )}
          {!data.is_failed && (
            <a href={image} download className={BAR_BUTTON}>
              <Icon name="download" />
              <span>Download PNG</span>
            </a>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-space-lg p-space-lg">
        <div className="grid grid-cols-1 items-stretch gap-space-lg lg:grid-cols-12">
          <div className={`lg:col-span-6 ${PANEL}`}>
            <div className="flex items-center justify-between gap-space-sm">
              <div className="flex items-center gap-space-sm">
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined text-icon text-primary"
                >
                  photo_camera
                </span>
                <h2 className="text-panel-title uppercase text-fg">Screenshot Preview</h2>
              </div>
              <div className="flex items-center gap-space-sm">
                {live !== null && (
                  <a
                    href={live}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open the live page in a new tab"
                    className={SMALL_LINK}
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
                    className={SMALL_LINK}
                  >
                    <Icon name="download" />
                    <span>PNG</span>
                  </a>
                )}
              </div>
            </div>
            <div className="overflow-hidden rounded-sm border border-border bg-bg">
              {data.is_failed ? (
                <div className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-space-sm bg-crit-soft p-space-md">
                  <span
                    aria-hidden="true"
                    className="material-symbols-outlined text-icon text-crit"
                  >
                    sync_problem
                  </span>
                  <p className="break-words text-center text-body-code text-crit">
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
            <div className="flex items-center justify-between gap-space-sm rounded-sm border border-border bg-surface-2 p-space-sm">
              <span className="min-w-0 break-all text-body-code text-fg-muted">{finalUrl}</span>
              <button
                type="button"
                onClick={copy}
                disabled={data.final_url === null}
                aria-label={copied ? 'URL copied' : 'Copy URL'}
                className="shrink-0 rounded-sm p-space-xs text-fg-muted hover:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <Icon name={copied ? 'check' : 'content_copy'} />
              </button>
            </div>
          </div>

          <div className={`lg:col-span-6 ${PANEL}`}>
            <div className="flex flex-col gap-space-sm">
              <h1 className="text-headline-lg text-fg">Screenshot Detail</h1>
              <span className="break-all text-body-code text-fg-muted">ID: {data.id}</span>
              <p className="break-words text-body-default text-fg">
                {data.title ?? (data.is_failed ? 'Screenshot failed' : 'Untitled page')}
              </p>
            </div>
            <dl className="grid grid-cols-1 gap-space-sm text-body-default sm:grid-cols-2">
              <div className="flex flex-col rounded-sm bg-surface-2 p-space-sm">
                <dt className="text-label-caps uppercase text-fg-muted">Final URL</dt>
                <dd className="break-all text-body-code text-fg">{finalUrl}</dd>
              </div>
              <div className="flex flex-col rounded-sm bg-surface-2 p-space-sm">
                <dt className="text-label-caps uppercase text-fg-muted">HTTP status</dt>
                <dd className="text-body-code text-fg">
                  {data.status_code === null ? 'None' : String(data.status_code)}
                </dd>
              </div>
              <div className="flex flex-col rounded-sm bg-surface-2 p-space-sm">
                <dt className="text-label-caps uppercase text-fg-muted">Content length</dt>
                <dd className="text-body-code text-fg">
                  {url.isError
                    ? 'Unavailable'
                    : contentLength === undefined
                      ? 'Loading…'
                      : contentLength === null
                        ? 'Unknown'
                        : formatBytes(contentLength)}
                </dd>
              </div>
              <div className="flex flex-col rounded-sm bg-surface-2 p-space-sm">
                <dt className="text-label-caps uppercase text-fg-muted">Taken at</dt>
                <dd className="text-body-code text-fg">{formatMoment(data.captured_at)}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className={PANEL}>
          <div className="flex items-center gap-space-sm">
            <span aria-hidden="true" className="material-symbols-outlined text-icon text-primary">
              security
            </span>
            <h3 className="text-panel-title uppercase text-fg">Response Headers</h3>
          </div>
          <HeaderList headers={data.http_headers} />
        </div>

        <div className={PANEL}>
          <div className="flex items-center gap-space-sm">
            <span aria-hidden="true" className="material-symbols-outlined text-icon text-primary">
              memory
            </span>
            <h2 className="text-panel-title uppercase text-fg">
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
