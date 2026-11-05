'use client';

import Link from 'next/link';
import { type FormEvent, type ReactElement, useState } from 'react';

import { Pagination, useCursorStack } from '@/components/pagination';
import { type AssetEvent, useAssetEvents } from '@/lib/asset-events';
import type { Screenshot } from '@/lib/domain-detail';
import type { DomainDetail } from '@/lib/domains';
import { SEVERITY_LABEL, useFindings } from '@/lib/findings';
import { formatMoment } from '@/lib/format-moment';
import { SEVERITIES } from '@/lib/programs';
import { useTagDomain, useTags, useUntagAsset } from '@/lib/tags';

import { COUNT, FIELD, SEVERITY_BAR, SEVERITY_TONE } from '../asset-ui';
import { CopyButton } from './copy-button';

const PANEL = 'overflow-hidden rounded-sm border border-border bg-surface';
const PANEL_HEAD =
  'flex items-center justify-between gap-space-sm border-b border-border bg-surface-2 px-space-md py-space-sm';
const PANEL_TITLE = 'flex items-center gap-space-xs text-label-caps uppercase text-fg-muted';
const KEY = 'text-caption text-fg-muted';
const VALUE = 'text-body-code text-fg';
const LINE = 'flex flex-wrap items-center justify-between gap-space-sm py-space-xs';

export function TargetPanel({
  domain,
  programName,
  discoverySource,
}: {
  domain: DomainDetail;
  programName: string;
  discoverySource: string;
}): ReactElement {
  return (
    <div className="flex flex-col">
      <div className={PANEL}>
        <div className={PANEL_HEAD}>
          <span className={PANEL_TITLE}>
            <span aria-hidden="true" className="material-symbols-outlined text-icon">
              feed
            </span>
            Target
          </span>
          <span className="flex items-center gap-space-xs text-caption text-fg-muted">
            <span className="text-body-code">{domain.id}</span>
            <CopyButton value={domain.id} label="Copy domain ID" />
          </span>
        </div>
        <div className="flex flex-col gap-space-xs p-space-md">
          <div className={LINE}>
            <span className={KEY}>Domain</span>
            <span className={VALUE}>{domain.name}</span>
          </div>
          <div className={LINE}>
            <span className={KEY}>Program</span>
            <Link
              href={`/programs/${encodeURIComponent(domain.program_id)}`}
              className="flex items-center gap-space-xs text-body-code text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {programName}
              <span aria-hidden="true" className="material-symbols-outlined text-icon">
                open_in_new
              </span>
            </Link>
          </div>
          <div className={LINE}>
            <span className={KEY}>Discovery source</span>
            <span className={VALUE}>{discoverySource}</span>
          </div>
          <div className="flex flex-col gap-space-xs py-space-xs">
            <div className="flex items-center justify-between">
              <span className={KEY}>{`Resolves to (${COUNT.format(domain.ips.length)})`}</span>
              {domain.cname !== null && (
                <span className="text-caption text-fg-muted">{`CNAME ${domain.cname}`}</span>
              )}
            </div>
            <div className="grid grid-cols-1 gap-space-xs">
              {domain.ips.length === 0 && (
                <span className="text-body-code text-fg-muted">No IP addresses.</span>
              )}
              {domain.ips.map((ip) => (
                <div
                  key={ip}
                  className="flex items-center justify-between rounded-sm bg-surface-2 px-space-sm"
                >
                  <div className="flex items-center gap-space-xs">
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-good" />
                    <span className="text-body-code text-fg">{ip}</span>
                  </div>
                  <CopyButton value={ip} label={`Copy ${ip}`} />
                </div>
              ))}
            </div>
          </div>
          <div className={LINE}>
            <span className={KEY}>First seen</span>
            <span className={VALUE}>{formatMoment(domain.first_seen_at)}</span>
          </div>
          <div className={LINE}>
            <span className={KEY}>Last seen</span>
            <span className={VALUE}>{formatMoment(domain.last_seen_at)}</span>
          </div>
          <TagEditor domain={domain} />
        </div>
      </div>
    </div>
  );
}

function TagEditor({ domain }: { domain: DomainDetail }): ReactElement {
  const catalogue = useTags();
  const tag = useTagDomain();
  const untag = useUntagAsset();
  const [choice, setChoice] = useState('');
  const onDomain = new Set(domain.tags.map((t) => t.tag_id));
  const free = (catalogue.data?.items ?? []).filter((t) => !onDomain.has(t.id));

  const add = (event: FormEvent) => {
    event.preventDefault();
    if (choice === '') return;
    tag.mutate({ tag_id: choice, domain_id: domain.id }, { onSuccess: () => setChoice('') });
  };

  return (
    <div className="flex flex-col gap-space-sm py-space-xs">
      <span className={KEY}>Tags</span>
      <div className="flex flex-wrap items-center gap-space-xs">
        {domain.tags.length === 0 && <span className="text-body-code text-fg-muted">No tags.</span>}
        {domain.tags.map((t) => (
          <span
            key={t.id}
            className="inline-flex items-center gap-space-xs rounded-sm border border-border bg-surface-2 pl-space-sm text-body-code text-fg"
          >
            {`${t.key}: ${t.value}`}
            <button
              type="button"
              aria-label={`Remove tag ${t.key}: ${t.value}`}
              disabled={untag.isPending}
              onClick={() => untag.mutate(t.id)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-fg-muted hover:text-fg focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-icon">
                close
              </span>
            </button>
          </span>
        ))}
      </div>
      <form onSubmit={add} className="flex flex-wrap items-center gap-space-xs">
        <label htmlFor="domain-tag" className="sr-only">
          Tag to add
        </label>
        <select
          id="domain-tag"
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          className={FIELD}
        >
          <option value="">Choose a tag</option>
          {free.map((t) => (
            <option key={t.id} value={t.id}>
              {`${t.key}: ${t.value}`}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={choice === '' || tag.isPending}
          className="h-9 rounded-sm border border-border bg-surface px-space-md text-body-default text-fg hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
        >
          Add tag
        </button>
      </form>
      {(tag.isError || untag.isError) && (
        <p role="alert" className="text-body-default text-crit">
          {tag.isError ? 'Could not add the tag.' : 'Could not remove the tag.'}
        </p>
      )}
    </div>
  );
}

export function FindingsPanel({ domain }: { domain: DomainDetail }): ReactElement {
  const latest = useFindings({ domainId: domain.id, limit: 1 });
  const counts = domain.finding_counts;
  const total = SEVERITIES.reduce((n, s) => n + counts[s], 0);
  const top = latest.data?.items[0];
  return (
    <div className={PANEL}>
      <div className={PANEL_HEAD}>
        <div className="flex items-center gap-space-xs">
          <span aria-hidden="true" className="material-symbols-outlined text-icon text-fg-muted">
            security
          </span>
          <span className={PANEL_TITLE}>Findings by severity</span>
        </div>
        <span className="text-caption text-fg-muted">{`${COUNT.format(total)} open`}</span>
      </div>
      <div className="flex h-2 w-full bg-surface-2">
        {SEVERITIES.filter((s) => counts[s] > 0).map((s) => (
          <div
            key={s}
            title={`${counts[s]} ${SEVERITY_LABEL[s]}`}
            className={`h-full ${SEVERITY_BAR[s]}`}
            style={{ width: `${(counts[s] / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-space-xs p-space-md sm:grid-cols-5">
        {SEVERITIES.map((s) => (
          <div
            key={s}
            className={`flex items-center justify-between rounded-sm border px-space-sm py-space-xs ${SEVERITY_TONE[s]}`}
          >
            <span className="text-caption">{SEVERITY_LABEL[s]}</span>
            <span className="text-body-code-bold">{COUNT.format(counts[s])}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-space-sm border-t border-border px-space-md py-space-sm">
        <div className="flex min-w-0 items-center gap-space-xs">
          <span aria-hidden="true" className="material-symbols-outlined text-icon text-fg-muted">
            bug_report
          </span>
          {top === undefined ? (
            <span className="text-body-default text-fg-muted">
              {latest.isPending ? 'Loading findings…' : 'No findings on this domain.'}
            </span>
          ) : (
            <>
              {top.cve[0] !== undefined && (
                <span className="text-body-code text-fg-muted">{top.cve[0]}</span>
              )}
              <span className="truncate text-body-default text-fg">{top.name}</span>
            </>
          )}
        </div>
        <Link
          href={`/findings?domain_id=${encodeURIComponent(domain.id)}`}
          className="flex items-center gap-space-xs text-body-default text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <span>View in Findings</span>
          <span aria-hidden="true" className="material-symbols-outlined text-icon">
            arrow_forward
          </span>
        </Link>
      </div>
    </div>
  );
}

export function CapturePanel({
  latest,
  pending,
}: {
  latest: Screenshot | undefined;
  pending: boolean;
}): ReactElement {
  return (
    <div className={PANEL}>
      <div className={PANEL_HEAD}>
        <div className="flex items-center gap-space-xs">
          <span aria-hidden="true" className="material-symbols-outlined text-icon text-fg-muted">
            screenshot_monitor
          </span>
          <span className={PANEL_TITLE}>Latest screenshot</span>
        </div>
        <span className="text-caption text-fg-muted">
          {latest === undefined ? '' : `Captured ${formatMoment(latest.captured_at)}`}
        </span>
      </div>
      <div className="p-space-md">
        {latest === undefined ? (
          <p className="text-body-default text-fg-muted">
            {pending ? 'Loading screenshots…' : 'No screenshots of this domain yet.'}
          </p>
        ) : (
          <div className="flex flex-col gap-space-sm">
            {latest.is_failed ? (
              <p className="text-body-default text-crit">
                {latest.error_message ?? 'The capture failed.'}
              </p>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- streamed by the API, not a static asset
              <img
                src={`/api/v1/screenshots/${encodeURIComponent(latest.id)}/image`}
                alt={`Screenshot of ${latest.final_url ?? 'the domain'}`}
                className="w-full rounded-sm border border-border"
              />
            )}
            <span className="text-body-code text-fg-muted">
              {latest.status_code === null ? 'No HTTP status' : `HTTP ${latest.status_code}`}
            </span>
            <div className="flex items-end justify-between gap-space-sm">
              <div className="min-w-0">
                <p className="truncate text-body-default text-fg">{latest.title ?? 'No title'}</p>
                <p className="truncate text-body-code text-fg-muted">{latest.final_url ?? ''}</p>
              </div>
              <Link
                href={`/screenshots/${encodeURIComponent(latest.id)}`}
                className="flex items-center gap-space-xs text-body-default text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <span>Inspect</span>
                <span aria-hidden="true" className="material-symbols-outlined text-icon">
                  open_in_full
                </span>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** A changed column as `old → new`. Values come from the target: shown as text only. */
function describeDiff(diff: AssetEvent['diff']): string[] {
  if (diff === null) return [];
  return Object.entries(diff).map(([field, change]) => {
    if (typeof change === 'object' && change !== null && 'old' in change && 'new' in change) {
      const { old, new: next } = change as { old: unknown; new: unknown };
      return `${field}: ${JSON.stringify(old)} → ${JSON.stringify(next)}`;
    }
    return `${field}: ${JSON.stringify(change)}`;
  });
}

export function EventsPanel({ domainId }: { domainId: string }): ReactElement {
  const { cursor, canGoBack, goNext, goBack } = useCursorStack();
  const events = useAssetEvents({ domainId, limit: 10 }, cursor);
  return (
    <div className={PANEL}>
      <div className={PANEL_HEAD}>
        <div className="flex items-center gap-space-xs">
          <span aria-hidden="true" className="material-symbols-outlined text-icon text-fg-muted">
            history
          </span>
          <span className={PANEL_TITLE}>Asset events</span>
        </div>
        {events.data !== undefined && (
          <span className="text-caption text-fg-muted">
            {`${COUNT.format(events.data.total)} events`}
          </span>
        )}
      </div>
      <div className="divide-y divide-border">
        {events.isPending && (
          <p className="px-space-md py-space-md text-body-default text-fg-muted">
            Loading asset events…
          </p>
        )}
        {events.isError && (
          <p role="alert" className="px-space-md py-space-md text-body-default text-crit">
            Could not load the asset events.
          </p>
        )}
        {events.data?.items.length === 0 && (
          <p className="px-space-md py-space-md text-body-default text-fg-muted">
            No asset events yet.
          </p>
        )}
        {events.data?.items.map((event) => (
          <div
            key={event.id}
            className="flex flex-col gap-space-xs px-space-md py-space-sm md:flex-row md:items-center md:justify-between"
          >
            <div className="flex min-w-0 items-start gap-space-sm">
              <span
                aria-hidden="true"
                className="material-symbols-outlined text-icon text-fg-muted"
              >
                {event.event_type === 'discovered' ? 'add_circle' : 'change_circle'}
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="text-body-default text-fg">
                  {event.event_type === 'discovered' ? 'Discovered' : 'Changed'}
                </span>
                <span className="truncate text-body-code text-fg-muted">
                  {`${event.asset_type}: ${event.asset_name}`}
                </span>
                {describeDiff(event.diff).map((line) => (
                  <span key={line} className="break-all text-body-code text-fg-muted">
                    {line}
                  </span>
                ))}
              </div>
            </div>
            <span className="shrink-0 text-body-code text-fg-muted">
              {formatMoment(event.created_at)}
            </span>
          </div>
        ))}
      </div>
      {events.data !== undefined && (
        <div className="border-t border-border bg-surface-2 px-space-md">
          <Pagination
            label="Asset events pagination"
            page={{
              total: events.data.total,
              totalIsEstimate: events.data.total_is_estimate,
              nextCursor: events.data.next_cursor,
            }}
            canGoBack={canGoBack}
            onBack={goBack}
            onNext={() => goNext(events.data.next_cursor)}
          />
        </div>
      )}
    </div>
  );
}
