'use client';

import Link from 'next/link';
import { type ReactElement, useState } from 'react';

import { Pagination, useCursorStack } from '@/components/pagination';
import { useMe } from '@/lib/auth';
import {
  DNS_STATUSES,
  type DnsStatus,
  type DomainFilter,
  domainExportHref,
  useDomains,
} from '@/lib/domains';

import {
  BUTTON,
  BUTTON_ICON,
  COUNT,
  COUNT_TAG,
  DNS_LABEL,
  FIELD,
  IN_SCOPE_OPTIONS,
  LIMIT_FIELD,
  LIMIT_LABEL,
  PAGE_SIZES,
  PRIMARY_BUTTON,
  PRIMARY_ICON,
  parseInScope,
  SEGMENT_OFF,
  SEGMENT_ON,
  SEGMENTS,
  TABLE_FOOT,
} from './asset-ui';
import { DomainTable } from './domain-table';
import { RunScanButton } from './run-scan-button';
import { useProgramOptions } from './use-program-options';
import { useSelection } from './use-selection';

type Figure = { value: number; estimate: boolean } | null | undefined;

function figureOf(page: { total: number; total_is_estimate: boolean } | undefined): Figure {
  return page === undefined ? undefined : { value: page.total, estimate: page.total_is_estimate };
}

function sum(a: Figure, b: Figure): Figure {
  if (a === undefined || b === undefined) return undefined;
  if (a === null || b === null) return null;
  return { value: a.value + b.value, estimate: a.estimate || b.estimate };
}

// Each tile has its accent: the top bar and the label share the colour, as in the mockup.
const BAR = { primary: 'bg-primary-container', good: 'bg-good', crit: 'bg-crit' } as const;
const LABEL_TONE = { primary: 'text-fg-faint', good: 'text-good', crit: 'text-crit' } as const;

function Tile({
  label,
  icon,
  bar,
  figure,
  note,
}: {
  label: string;
  icon: string;
  bar: keyof typeof BAR;
  figure: Figure;
  note?: string;
}): ReactElement {
  return (
    <div
      data-stat-tile
      className="relative flex min-h-26 flex-col justify-start gap-3 overflow-hidden rounded-lg border border-border bg-surface p-4 shadow-sm"
    >
      <div className={`absolute inset-x-0 top-0 h-[3px] ${BAR[bar]}`} />
      <div className="flex items-center justify-between gap-1">
        <span className={`text-[11px] font-semibold uppercase tracking-wider ${LABEL_TONE[bar]}`}>
          {label}
        </span>
        <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-fg-faint">
          {icon}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-space-sm">
        {figure === undefined ? (
          <span className="text-body-default text-fg-muted">Loading…</span>
        ) : figure === null ? (
          <span className="text-body-default text-fg-muted">Unavailable</span>
        ) : (
          <span className="font-body-code text-[26px] font-bold leading-none tracking-tight text-fg">
            {(figure.estimate ? '~' : '') + COUNT.format(figure.value)}
          </span>
        )}
        {note !== undefined && (
          <span className="font-body-code text-[11px] text-fg-faint">{note}</span>
        )}
      </div>
    </div>
  );
}

export default function DomainsPage(): ReactElement {
  const me = useMe();
  const { programs, nameOf } = useProgramOptions();
  const [programId, setProgramId] = useState('');
  const [dnsStatus, setDnsStatus] = useState<DnsStatus | null>(null);
  const [inScope, setInScope] = useState('');
  const [limit, setLimit] = useState<number>(PAGE_SIZES[0]);
  const { cursor, canGoBack, goNext, goBack, reset } = useCursorStack();
  const selection = useSelection();

  const base = { programId: programId === '' ? null : programId, inScope: parseInScope(inScope) };
  const filter: DomainFilter = { ...base, dnsStatus, sort: 'name', limit };
  const domains = useDomains(filter, cursor);
  // Tile totals: one row per request, only `total` is read.
  const all = useDomains({ ...base, limit: 1 });
  const resolved = useDomains({ ...base, dnsStatus: 'resolved', limit: 1 });
  const nxdomain = useDomains({ ...base, dnsStatus: 'nxdomain', limit: 1 });
  const timeout = useDomains({ ...base, dnsStatus: 'timeout', limit: 1 });

  // Every cursor and every selected row belongs to the previous result set.
  const restart = () => {
    reset();
    selection.clear();
  };

  const rows = domains.data?.items ?? [];
  const canManageScope = me.data !== undefined && me.data.role !== 'user';

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-col justify-between gap-space-md sm:flex-row sm:items-center">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-space-sm">
            <h1 className="font-headline-lg text-headline-lg tracking-tight text-fg">Domains</h1>
          </div>
          <p className="max-w-2xl text-body-default text-fg-muted">
            All domains across the programs you can see. Times are Vietnam time.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-space-sm">
          <a href={domainExportHref(filter)} download className={BUTTON}>
            <span aria-hidden="true" className={BUTTON_ICON}>
              download
            </span>
            <span>Export CSV</span>
          </a>
          {canManageScope && (
            <Link href="/manage" className={PRIMARY_BUTTON}>
              <span aria-hidden="true" className={PRIMARY_ICON}>
                add_circle
              </span>
              <span>Add Scope</span>
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile label="Total domains" icon="domain" bar="primary" figure={figureOf(all.data)} />
        <Tile
          label="Resolved"
          icon="check_circle"
          bar="good"
          figure={resolved.isError ? null : figureOf(resolved.data)}
        />
        <Tile
          label="Unresolved"
          icon="error"
          bar="crit"
          figure={
            nxdomain.isError || timeout.isError
              ? null
              : sum(figureOf(nxdomain.data), figureOf(timeout.data))
          }
          note="NXDOMAIN and timeout"
        />
      </div>

      <div className="flex w-full flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-space-sm border-b border-border bg-surface-2 px-4 py-2">
          <div className="flex flex-wrap items-center gap-space-sm">
            <div>
              <label htmlFor="domains-program" className="sr-only">
                Program
              </label>
              <select
                id="domains-program"
                value={programId}
                onChange={(e) => {
                  setProgramId(e.target.value);
                  restart();
                }}
                className={FIELD}
              >
                <option value="">All programs</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className={SEGMENTS}>
              {[null, ...DNS_STATUSES].map((value) => (
                <button
                  key={value ?? 'all'}
                  type="button"
                  aria-pressed={dnsStatus === value}
                  onClick={() => {
                    setDnsStatus(value);
                    restart();
                  }}
                  className={dnsStatus === value ? SEGMENT_ON : SEGMENT_OFF}
                >
                  {value === null ? 'All' : DNS_LABEL[value]}
                </button>
              ))}
            </div>
            <label className="flex items-center">
              <span className="sr-only">Scope</span>
              <select
                value={inScope}
                onChange={(e) => {
                  setInScope(e.target.value);
                  restart();
                }}
                className={FIELD}
              >
                {IN_SCOPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            {domains.data !== undefined && (
              <span className={COUNT_TAG}>
                {(domains.data.total_is_estimate ? '~' : '') +
                  `${COUNT.format(domains.data.total)} domains`}
              </span>
            )}
          </div>
          <div className="flex items-center gap-space-xs">
            <button
              type="button"
              aria-label="Refresh"
              title="Refresh"
              onClick={() => void domains.refetch()}
              className="inline-flex items-center justify-center rounded-sm border border-border bg-surface p-1.5 text-fg-muted hover:bg-surface-3 hover:text-fg focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                refresh
              </span>
            </button>
          </div>
        </div>

        {selection.ids.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-space-sm border-b border-accent-soft-bd bg-accent-soft px-4 py-1.5 text-primary">
            <div className="flex flex-wrap items-center gap-space-md">
              <div className="flex items-center gap-space-xs font-body-code text-caption font-semibold">
                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                  check_box
                </span>
                <span>{`${COUNT.format(selection.ids.size)} items selected`}</span>
              </div>
              <span aria-hidden="true" className="text-fg-faint">
                |
              </span>
              <div className="flex flex-wrap items-center gap-space-xs">
                <RunScanButton assets={selection.assets} programName={nameOf} compact />
              </div>
            </div>
            <div>
              <button
                type="button"
                onClick={selection.clear}
                className="text-caption text-fg-muted underline hover:text-fg focus:outline-none focus:ring-2 focus:ring-ring"
              >
                Clear selection
              </button>
            </div>
          </div>
        )}

        <div className="w-full">
          {domains.isPending && (
            <p className="px-space-md py-space-xl text-body-default text-fg-muted">
              Loading domains…
            </p>
          )}
          {domains.isError && (
            <p role="alert" className="px-space-md py-space-xl text-body-default text-crit">
              Could not load the domains.
            </p>
          )}
          {domains.data !== undefined && rows.length === 0 && (
            <p className="px-space-md py-space-xl text-center text-body-default text-fg-muted">
              No domains match these filters.
            </p>
          )}
          {domains.data !== undefined && rows.length > 0 && (
            <DomainTable
              rows={rows}
              selected={selection.ids}
              programName={nameOf}
              onToggle={(row) =>
                selection.toggle(row.id, { target: row.name, programId: row.program_id })
              }
              onToggleAll={(select) =>
                selection.setMany(
                  rows.map((r) => [r.id, { target: r.name, programId: r.program_id }] as const),
                  select,
                )
              }
            />
          )}
        </div>

        {domains.data !== undefined && (
          <div className={TABLE_FOOT}>
            <Pagination
              label="Domains pagination"
              page={{
                total: domains.data.total,
                totalIsEstimate: domains.data.total_is_estimate,
                nextCursor: domains.data.next_cursor,
              }}
              canGoBack={canGoBack}
              onBack={() => {
                goBack();
                selection.clear();
              }}
              onNext={() => {
                goNext(domains.data.next_cursor);
                selection.clear();
              }}
            />
            <div className="flex items-center gap-space-sm">
              <label htmlFor="domains-limit" className={LIMIT_LABEL}>
                Rows per page
              </label>
              <select
                id="domains-limit"
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  restart();
                }}
                className={LIMIT_FIELD}
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {`${size} / page`}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
