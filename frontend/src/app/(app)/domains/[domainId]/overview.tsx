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
import { useCreateTag, useTagDomain, useTags, useUntagAsset } from '@/lib/tags';

import { BUTTON, COUNT, FIELD, SEVERITY_BAR } from '../asset-ui';
import { CopyButton } from './copy-button';

// Panels follow the S05 mockup: a raised card holding framed key-value rows.
const PANEL =
  'flex flex-col gap-space-md rounded-lg border border-border bg-surface-2 p-space-lg shadow-sm';
const PANEL_HEAD =
  'flex items-center justify-between gap-space-sm border-b border-border pb-space-xs';
const PANEL_TITLE = 'flex items-center gap-1.5 font-panel-title text-panel-title text-fg';
const KEY = 'text-label-caps uppercase text-fg-muted';
const VALUE = 'font-body-code text-xs text-fg';
const LINE =
  'flex flex-col justify-between gap-1 rounded-sm border border-border bg-surface px-space-md py-2 sm:flex-row sm:items-center';
const BLOCK = 'flex flex-col gap-1.5 rounded-sm border border-border bg-surface px-space-md py-2';

/** Severity colours as on the other asset screens. The mockup's orange for high fails AA
 * contrast in the light theme, so high takes the amber warning colour. */
const SEVERITY_TEXT = {
  critical: 'text-crit',
  high: 'text-warn',
  medium: 'text-info',
  low: 'text-good',
  info: 'text-fg-muted',
} as const;

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
    <div className="flex h-full flex-col">
      <div className={PANEL + ' h-full'}>
        <div className={PANEL_HEAD}>
          <span className={PANEL_TITLE}>
            <span aria-hidden="true" className="material-symbols-outlined text-[17px] text-primary">
              feed
            </span>
            Target
          </span>
          <span className="flex min-w-0 items-center gap-1 rounded-sm border border-border bg-surface py-0.5 pl-2 font-body-code text-caption text-fg-faint">
            <span className="truncate">{domain.id}</span>
            <CopyButton value={domain.id} label="Copy domain ID" />
          </span>
        </div>
        <div className="flex flex-col gap-2 text-body-default">
          <div className={LINE}>
            <span className={KEY}>Domain</span>
            <span className="font-body-code text-sm font-semibold tracking-tight text-fg">
              {domain.name}
            </span>
          </div>
          <div className={LINE}>
            <span className={KEY}>Program</span>
            <Link
              href={`/programs/${encodeURIComponent(domain.program_id)}`}
              className="flex items-center gap-1 font-body-code text-xs font-semibold text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {programName}
              <span aria-hidden="true" className="material-symbols-outlined text-[13px]">
                open_in_new
              </span>
            </Link>
          </div>
          <div className={LINE}>
            <span className={KEY}>Discovery source</span>
            <span className="rounded-sm border border-border bg-surface-2 px-2 py-0.5 font-body-code text-xs text-fg">
              {discoverySource}
            </span>
          </div>
          <div className={BLOCK + ' gap-2'}>
            <div className="flex items-center justify-between gap-space-sm">
              <span className={KEY}>{`Resolves to (${COUNT.format(domain.ips.length)})`}</span>
              {domain.cname !== null && (
                <span className="truncate rounded-sm bg-surface-2 px-1.5 font-body-code text-[10px] uppercase tracking-wider text-fg-faint">{`CNAME ${domain.cname}`}</span>
              )}
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {domain.ips.length === 0 && (
                <span className="font-body-code text-xs text-fg-muted">No IP addresses.</span>
              )}
              {domain.ips.map((ip) => (
                <div
                  key={ip}
                  className="flex items-center justify-between rounded-sm border border-border bg-surface-2 py-0.5 pl-2.5 pr-1"
                >
                  <div className="flex items-center gap-2">
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-good" />
                    <span className="font-body-code text-xs text-primary">{ip}</span>
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
  const create = useCreateTag();
  const [choice, setChoice] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const onDomain = new Set(domain.tags.map((t) => t.tag_id));
  const free = (catalogue.data?.items ?? []).filter((t) => !onDomain.has(t.id));

  const add = (event: FormEvent) => {
    event.preventDefault();
    if (choice === '') return;
    tag.mutate({ tag_id: choice, domain_id: domain.id }, { onSuccess: () => setChoice('') });
  };

  // A new tag goes into the catalogue first, then onto this domain.
  const addNew = (event: FormEvent) => {
    event.preventDefault();
    const key = newKey.trim();
    const value = newValue.trim();
    if (key === '' || value === '') return;
    create.mutate(
      { key, value },
      {
        onSuccess: (created) =>
          tag.mutate(
            { tag_id: created.id, domain_id: domain.id },
            {
              onSuccess: () => {
                setNewKey('');
                setNewValue('');
              },
            },
          ),
      },
    );
  };

  return (
    <div className={BLOCK}>
      <span className={KEY}>Tags</span>
      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        {domain.tags.length === 0 && (
          <span className="font-body-code text-caption text-fg-muted">No tags.</span>
        )}
        {domain.tags.map((t) => (
          <span
            key={t.id}
            className="inline-flex items-center gap-0.5 rounded-sm border border-border bg-surface-3 pl-2 font-body-code text-caption text-secondary"
          >
            {`${t.key}: ${t.value}`}
            <button
              type="button"
              aria-label={`Remove tag ${t.key}: ${t.value}`}
              disabled={untag.isPending}
              onClick={() => untag.mutate(t.id)}
              className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-fg-muted hover:text-fg focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[13px]">
                close
              </span>
            </button>
          </span>
        ))}
      </div>
      <form onSubmit={add} className="flex flex-wrap items-center gap-space-xs pt-space-xs">
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
        <button type="submit" disabled={choice === '' || tag.isPending} className={BUTTON}>
          Add tag
        </button>
      </form>
      <form onSubmit={addNew} className="flex flex-wrap items-center gap-space-xs">
        <label htmlFor="domain-tag-key" className="sr-only">
          New tag key
        </label>
        <input
          id="domain-tag-key"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          placeholder="key"
          className={FIELD + ' w-28 font-body-code'}
        />
        <label htmlFor="domain-tag-value" className="sr-only">
          New tag value
        </label>
        <input
          id="domain-tag-value"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          placeholder="value"
          className={FIELD + ' w-28 font-body-code'}
        />
        <button
          type="submit"
          disabled={
            newKey.trim() === '' || newValue.trim() === '' || create.isPending || tag.isPending
          }
          className={BUTTON}
        >
          Create tag
        </button>
      </form>
      {(tag.isError || untag.isError || create.isError) && (
        <p role="alert" className="text-caption text-crit">
          {create.isError
            ? 'Could not create the tag. It may already exist.'
            : tag.isError
              ? 'Could not add the tag.'
              : 'Could not remove the tag.'}
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
        <span className={PANEL_TITLE}>
          <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-crit">
            security
          </span>
          Findings by Severity
        </span>
        <span className="rounded-sm border border-crit-bd bg-crit-soft px-2 py-0.5 font-body-code text-caption font-medium text-crit">{`${COUNT.format(total)} open`}</span>
      </div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full border border-border bg-surface">
        {SEVERITIES.filter((s) => counts[s] > 0).map((s) => (
          <div
            key={s}
            title={`${counts[s]} ${SEVERITY_LABEL[s]}`}
            className={`h-full ${SEVERITY_BAR[s]}`}
            style={{ width: `${(counts[s] / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-space-sm sm:grid-cols-5">
        {SEVERITIES.map((s) => (
          <div
            key={s}
            className="flex flex-col items-center justify-center rounded-sm border border-border bg-surface p-space-sm"
          >
            <span className={`mb-0.5 text-label-caps uppercase ${SEVERITY_TEXT[s]}`}>
              {SEVERITY_LABEL[s]}
            </span>
            <span className={`font-body-code text-stat-lg leading-none ${SEVERITY_TEXT[s]}`}>
              {COUNT.format(counts[s])}
            </span>
          </div>
        ))}
      </div>
      <div
        className={`flex flex-wrap items-center justify-between gap-2 rounded-sm border p-space-sm text-caption ${top?.severity === 'critical' ? 'border-crit-bd bg-crit-soft' : 'border-border bg-surface'}`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-space-sm">
          <span
            aria-hidden="true"
            className={`material-symbols-outlined shrink-0 text-[18px] ${top === undefined ? 'text-fg-muted' : SEVERITY_TEXT[top.severity]}`}
          >
            bug_report
          </span>
          {top === undefined ? (
            <span className="text-fg-muted">
              {latest.isPending ? 'Loading findings…' : 'No findings on this domain.'}
            </span>
          ) : (
            <>
              {top.cve[0] !== undefined && (
                <span
                  className={`shrink-0 font-body-code font-semibold ${SEVERITY_TEXT[top.severity]}`}
                >
                  {top.cve[0]}
                </span>
              )}
              <span className="truncate text-fg-muted">{top.name}</span>
            </>
          )}
        </div>
        <Link
          href={`/findings?domain_id=${encodeURIComponent(domain.id)}`}
          className="flex shrink-0 items-center gap-1 font-body-code font-medium text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <span>View in Findings</span>
          <span aria-hidden="true" className="material-symbols-outlined text-[13px]">
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
        <span className={PANEL_TITLE}>
          <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-tertiary">
            screenshot_monitor
          </span>
          Latest Screenshot
        </span>
        <span className="font-body-code text-caption text-fg-faint">
          {latest === undefined ? '' : `Captured ${formatMoment(latest.captured_at)}`}
        </span>
      </div>
      {latest === undefined ? (
        <p className="text-body-default text-fg-muted">
          {pending ? 'Loading screenshots…' : 'No screenshots of this domain yet.'}
        </p>
      ) : (
        // The mockup lays status, title, URL and Inspect over a fixed-height crop of the capture.
        <div className="relative h-44 overflow-hidden rounded-lg border border-border bg-surface-3">
          {latest.is_failed ? (
            <p className="p-space-md text-body-default text-crit">
              {latest.error_message ?? 'The capture failed.'}
            </p>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- streamed by the API, not a static asset
            <img
              src={`/api/v1/screenshots/${encodeURIComponent(latest.id)}/image`}
              alt={`Screenshot of ${latest.final_url ?? 'the domain'}`}
              className="h-full w-full object-cover object-top opacity-80"
            />
          )}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent"
          />
          <span
            className={`absolute left-space-sm top-space-sm rounded-sm border px-2 py-0.5 font-body-code text-caption font-bold ${latest.status_code !== null && latest.status_code < 400 ? 'border-good-bd bg-good-soft text-good' : 'border-crit-bd bg-crit-soft text-crit'}`}
          >
            {latest.status_code === null ? 'No HTTP status' : `HTTP ${latest.status_code}`}
          </span>
          <div className="absolute inset-x-space-sm bottom-space-sm flex items-end justify-between gap-space-sm">
            <div className="min-w-0 pr-2">
              <p className="truncate text-sm font-medium text-fg">{latest.title ?? 'No title'}</p>
              <p className="truncate font-body-code text-caption text-fg-muted">
                {latest.final_url ?? ''}
              </p>
            </div>
            <Link
              href={`/screenshots/${encodeURIComponent(latest.id)}`}
              className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-accent-soft-bd bg-surface px-2 py-1 font-body-code text-caption text-primary hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <span>Inspect</span>
              <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
                open_in_full
              </span>
            </Link>
          </div>
        </div>
      )}
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

// Event kinds are `discovered` and `changed` only (decision log, part C): each has its mockup tone.
const EVENT_LOOK = {
  discovered: {
    label: 'Discovered',
    icon: 'add_circle',
    box: 'border-good-bd bg-good-soft text-good',
    chip: 'text-good',
  },
  changed: {
    label: 'Changed',
    icon: 'change_circle',
    box: 'border-warn-bd bg-warn-soft text-warn',
    chip: 'text-warn',
  },
} as const;

export function EventsPanel({ domainId }: { domainId: string }): ReactElement {
  const { cursor, canGoBack, goNext, goBack } = useCursorStack();
  const events = useAssetEvents({ domainId, limit: 10 }, cursor);
  return (
    <div className={PANEL}>
      <div className={PANEL_HEAD}>
        <div className="flex items-center gap-2">
          <span className={PANEL_TITLE}>
            <span aria-hidden="true" className="material-symbols-outlined text-[19px] text-primary">
              history
            </span>
            Asset events
          </span>
          {events.data !== undefined && (
            <span className="rounded-sm border border-border bg-surface px-2 font-body-code text-[11px] text-fg-muted">
              {`${COUNT.format(events.data.total)} events`}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {events.isPending && (
          <p className="text-body-default text-fg-muted">Loading asset events…</p>
        )}
        {events.isError && (
          <p role="alert" className="text-body-default text-crit">
            Could not load the asset events.
          </p>
        )}
        {events.data?.items.length === 0 && (
          <p className="text-body-default text-fg-muted">No asset events yet.</p>
        )}
        {events.data?.items.map((event) => {
          const look = EVENT_LOOK[event.event_type];
          return (
            <div
              key={event.id}
              className="flex flex-col justify-between gap-3 rounded-sm border border-border bg-surface p-space-md md:flex-row md:items-center"
            >
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border ${look.box}`}
                >
                  <span className="material-symbols-outlined text-[18px]">{look.icon}</span>
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-sm border border-border bg-surface-2 px-2 py-0.5 font-body-code text-[11px] font-semibold uppercase ${look.chip}`}
                    >
                      {look.label}
                    </span>
                    <span className="truncate font-body-code text-sm font-semibold text-fg">
                      {event.asset_name}
                    </span>
                    <span className="rounded-sm border border-border bg-surface-2 px-1.5 font-body-code text-[11px] text-fg-muted">
                      {event.asset_type}
                    </span>
                  </div>
                  {describeDiff(event.diff).map((line) => (
                    <span
                      key={line}
                      className="break-all font-body-code text-caption text-fg-muted"
                    >
                      {line}
                    </span>
                  ))}
                </div>
              </div>
              <span className="shrink-0 self-end whitespace-nowrap font-body-code text-caption text-fg-faint md:self-center">
                {formatMoment(event.created_at)}
              </span>
            </div>
          );
        })}
      </div>
      {events.data !== undefined && (
        <div className="border-t border-border">
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
