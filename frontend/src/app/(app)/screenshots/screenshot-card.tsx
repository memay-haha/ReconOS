import Link from 'next/link';
import type { ReactElement } from 'react';

import { formatMoment } from '@/lib/format-moment';
import { type Screenshot, screenshotImageUrl } from '@/lib/screenshots';
import { httpHref } from '@/lib/url-detail';

type StatusClass = 'none' | 'ok' | 'other' | 'client' | 'server';

/** Badge tone by HTTP status class, as the mockup colours 2xx, 4xx and 5xx. */
const STATUS_TONE: Readonly<Record<StatusClass, string>> = {
  none: 'bg-surface-3 text-fg-muted',
  ok: 'bg-good-soft text-good',
  other: 'bg-info-soft text-info',
  client: 'bg-warn-soft text-warn',
  server: 'bg-crit-soft text-crit',
};

function statusClass(code: number | null): StatusClass {
  if (code === null) return 'none';
  if (code >= 500) return 'server';
  if (code >= 400) return 'client';
  return code >= 200 && code < 300 ? 'ok' : 'other';
}

/** One gallery card. Title, URL and error message come from the target: text only. */
export function ScreenshotCard({ shot }: { shot: Screenshot }): ReactElement {
  const detail = `/screenshots/${encodeURIComponent(shot.id)}`;
  const live = httpHref(shot.final_url);
  const url = shot.final_url ?? 'No final URL';

  if (shot.is_failed) {
    return (
      <article
        data-failed
        className="flex flex-col overflow-hidden rounded-sm border border-crit-bd bg-surface"
      >
        <div className="relative flex aspect-[2/1] w-full flex-col items-center justify-center gap-space-sm border-b border-border bg-crit-soft p-space-md">
          <span aria-hidden="true" className="material-symbols-outlined text-icon text-crit">
            sync_problem
          </span>
          <p className="max-w-full break-words text-center text-body-code text-crit">
            {shot.error_message ?? 'The screenshot failed with no error message.'}
          </p>
          <span className="absolute right-space-sm top-space-sm rounded-sm bg-surface px-space-xs text-label-caps uppercase text-crit">
            Failed
          </span>
        </div>
        <div className="flex flex-1 flex-col justify-between gap-space-sm p-space-md">
          <div className="flex min-w-0 flex-col gap-space-xs">
            <h2 className="truncate text-panel-title text-crit">
              <Link href={detail} className="hover:underline">
                {shot.title ?? 'Screenshot failed'}
              </Link>
            </h2>
            <span className="truncate text-body-code text-fg-muted">{url}</span>
          </div>
          <div className="border-t border-border pt-space-sm">
            <span className="text-body-code text-fg-muted">{formatMoment(shot.captured_at)}</span>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="flex flex-col overflow-hidden rounded-sm border border-border bg-surface hover:border-border-strong">
      <div className="relative aspect-[2/1] w-full overflow-hidden border-b border-border bg-surface-3">
        {/* The image is streamed by Backend API; next/image would proxy it through Next. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={screenshotImageUrl(shot.id)}
          alt={`Screenshot of ${url}`}
          loading="lazy"
          className="h-full w-full object-cover object-top"
        />
        <span
          className={`absolute right-space-sm top-space-sm rounded-sm px-space-xs text-body-code ${STATUS_TONE[statusClass(shot.status_code)]}`}
        >
          {shot.status_code === null ? 'No status' : String(shot.status_code)}
        </span>
        {live !== null && (
          <div className="absolute bottom-space-sm right-space-sm">
            <a
              href={live}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${url} in a new tab`}
              className="flex rounded-sm bg-surface p-space-xs text-fg hover:bg-surface-2"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-icon">
                open_in_new
              </span>
            </a>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col justify-between gap-space-sm p-space-md">
        <div className="flex min-w-0 flex-col gap-space-xs">
          <h2 className="truncate text-panel-title text-fg">
            <Link href={detail} className="hover:underline">
              {shot.title ?? 'Untitled page'}
            </Link>
          </h2>
          <span className="truncate text-body-code text-fg-muted">{url}</span>
        </div>
        <div className="border-t border-border pt-space-sm">
          <span className="text-body-code text-fg-muted">{formatMoment(shot.captured_at)}</span>
        </div>
      </div>
    </article>
  );
}
