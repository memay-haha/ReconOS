import Link from 'next/link';
import type { ReactElement } from 'react';

import { formatMoment } from '@/lib/format-moment';
import { type Screenshot, screenshotImageUrl } from '@/lib/screenshots';
import { httpHref } from '@/lib/url-detail';

import { STATUS_DOT, STATUS_TONE, statusClass, statusText } from './http-status';

const CHIP =
  'flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-body-code text-caption font-semibold shadow-sm';

/** One gallery card. Title, URL and error message come from the target: text only. */
export function ScreenshotCard({ shot }: { shot: Screenshot }): ReactElement {
  const detail = `/screenshots/${encodeURIComponent(shot.id)}`;
  const live = httpHref(shot.final_url);
  const url = shot.final_url ?? 'No final URL';

  if (shot.is_failed) {
    return (
      <article
        data-failed
        className="group flex flex-col overflow-hidden rounded-sm border border-crit-bd bg-surface transition-colors hover:border-crit"
      >
        <div className="relative flex aspect-[2/1] w-full flex-col items-center justify-center overflow-hidden border-b border-border bg-crit-soft p-3 text-center">
          <span className="mb-1 flex h-9 w-9 items-center justify-center rounded-full border border-crit-bd bg-crit/20 text-crit">
            <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
              sync_problem
            </span>
          </span>
          <p className="max-w-full truncate rounded-sm border border-crit-bd bg-surface px-2 py-0.5 font-body-code text-[11px] font-medium leading-tight text-crit">
            {shot.error_message ?? 'The screenshot failed with no error message.'}
          </p>
          <div className="pointer-events-none absolute inset-x-2 top-2 flex items-center justify-end">
            <span className={`${CHIP} border-crit-bd bg-crit-soft uppercase text-crit`}>
              <span aria-hidden="true" className="material-symbols-outlined text-[12px]">
                error
              </span>
              <span>Failed</span>
            </span>
          </div>
        </div>
        <div className="flex flex-1 flex-col justify-between gap-2.5 p-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="truncate text-panel-title leading-tight text-crit">
              <Link href={detail} className="hover:underline">
                {shot.title ?? 'Screenshot failed'}
              </Link>
            </h2>
            <div className="flex min-w-0 items-center gap-1">
              <span
                aria-hidden="true"
                className="material-symbols-outlined shrink-0 text-[13px] text-crit"
              >
                link_off
              </span>
              <span className="truncate font-body-code text-caption text-fg-muted" title={url}>
                {url}
              </span>
            </div>
          </div>
          <div className="border-t border-border pt-2">
            <span className="whitespace-nowrap font-body-code text-caption text-fg-muted">
              {formatMoment(shot.captured_at)}
            </span>
          </div>
        </div>
      </article>
    );
  }

  const tone = statusClass(shot.status_code);
  return (
    <article className="group flex flex-col overflow-hidden rounded-sm border border-border bg-surface transition-colors hover:border-border-strong hover:bg-surface-2">
      <div className="relative aspect-[2/1] w-full overflow-hidden border-b border-border bg-surface-3">
        {/* The image is streamed by Backend API; next/image would proxy it through Next. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={screenshotImageUrl(shot.id)}
          alt={`Screenshot of ${url}`}
          loading="lazy"
          className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
        />
        <div className="pointer-events-none absolute inset-x-2 top-2 flex items-center justify-end">
          <span className={`${CHIP} ${STATUS_TONE[tone]}`}>
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[tone]}`} />
            <span>{statusText(shot.status_code)}</span>
          </span>
        </div>
        {live !== null && (
          // Shown on hover like the mockup, and on keyboard focus so the link is never invisible.
          <div className="absolute bottom-2 right-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            <a
              href={live}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${url} in a new tab`}
              className="flex rounded-sm border border-border-strong bg-surface p-1 text-fg shadow hover:bg-surface-3"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
                open_in_new
              </span>
            </a>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col justify-between gap-2.5 p-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="truncate text-panel-title leading-tight text-fg group-hover:text-primary">
            <Link href={detail} className="hover:underline">
              {shot.title ?? 'Untitled page'}
            </Link>
          </h2>
          <div className="flex min-w-0 items-center gap-1">
            <span
              aria-hidden="true"
              className="material-symbols-outlined shrink-0 text-[13px] text-asset-url"
            >
              link
            </span>
            <span className="truncate font-body-code text-caption text-fg-muted" title={url}>
              {url}
            </span>
          </div>
        </div>
        <div className="border-t border-border pt-2">
          <span className="whitespace-nowrap font-body-code text-caption text-fg-muted">
            {formatMoment(shot.captured_at)}
          </span>
        </div>
      </div>
    </article>
  );
}
