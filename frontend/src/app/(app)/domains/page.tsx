'use client';

import Link from 'next/link';
import { type ReactElement, Suspense, useCallback, useEffect, useState } from 'react';

import { Pagination, useCursorStack } from '@/components/pagination';
import { useQueryParam } from '@/lib/url-params';
import { useMe } from '@/lib/auth';
import { useHiddenColumns } from '@/lib/column-prefs';
import {
  type DnsStatus,
  type DomainFilter,
  type DomainSummary,
  domainExportHref,
  useDomains,
  useDomainSummary,
  useRememberDomainNav,
} from '@/lib/domains';

import {
  BUTTON,
  BUTTON_ICON,
  COUNT,
  COUNT_TAG,
  FIELD,
  PRIMARY_BUTTON,
  PRIMARY_ICON,
  SEGMENT_OFF,
  SEGMENT_ON,
  SEGMENTS,
  TABLE_FOOT,
} from './asset-ui';
import { type Density, DomainTable, OPTIONAL_COLUMNS } from './domain-table';
import { FilterPresets } from './filter-presets';
import { Popover } from './popover';
import { ScanButton } from './scan-modal';
import { DeleteSelected, ExportSelected, TagSelected } from './selection-actions';
import { useProgramOptions } from './use-program-options';
import { useSelection } from './use-selection';

/** The mockup's three DNS segments. Unresolved is `nxdomain` and `timeout` (M4). */
const DNS_SEGMENTS = {
  all: { label: 'All', values: [] },
  resolved: { label: 'Resolved', values: ['resolved'] },
  unresolved: { label: 'Unresolved', values: ['nxdomain', 'timeout'] },
} as const satisfies Record<string, { label: string; values: readonly DnsStatus[] }>;
type DnsSegment = keyof typeof DNS_SEGMENTS;

function segmentOf(value: unknown): DnsSegment {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  if (list.length === 1 && list[0] === 'resolved') return 'resolved';
  if (list.length === 2 && list.includes('nxdomain') && list.includes('timeout'))
    return 'unresolved';
  return 'all';
}

const TOOL_BUTTON =
  'inline-flex h-8 w-8 items-center justify-center rounded-sm border border-border bg-surface text-fg-muted hover:bg-surface-3 hover:text-fg focus:outline-none focus:ring-2 focus:ring-ring';

/** Ratios print with one decimal, two under 10% so a small share does not read as zero. */
function percent(part: number, whole: number): string | null {
  if (whole === 0) return null;
  const value = (part / whole) * 100;
  return `${value.toFixed(value < 10 ? 2 : 1)}%`;
}

/** New domains in 24 hours against the daily average of the 7 days before (M9). */
function delta(summary: DomainSummary): string {
  if (summary.new_daily_avg_7d === 0) return 'no 7-day baseline';
  const change = ((summary.new_24h - summary.new_daily_avg_7d) / summary.new_daily_avg_7d) * 100;
  return `${change >= 0 ? '+' : ''}${change.toFixed(1)}% vs avg`;
}

// Each tile has its accent: the top bar, the label and the ratio chip share the colour.
const BAR = {
  primary: 'bg-primary-container',
  good: 'bg-good',
  crit: 'bg-crit',
  warn: 'bg-warn',
  info: 'bg-info',
} as const;
const LABEL_TONE = {
  primary: 'text-fg-faint',
  good: 'text-good',
  crit: 'text-crit',
  warn: 'text-warn',
  info: 'text-info',
} as const;
const CHIP_TONE = {
  primary: 'border-border bg-surface-2 text-fg-muted',
  good: 'border-good-bd bg-good-soft text-good',
  crit: 'border-crit-bd bg-crit-soft text-crit',
  warn: 'border-warn-bd bg-warn-soft text-warn',
  info: 'border-info-bd bg-info-soft text-info',
} as const;
type Tone = keyof typeof BAR;

function Tile({
  label,
  icon,
  tone,
  value,
  chip,
  note,
  fill,
}: {
  label: string;
  icon: string;
  tone: Tone;
  /** `undefined` while loading, `null` when the summary failed. */
  value: number | null | undefined;
  /** A ratio or tag beside the label, as in the mockup. */
  chip?: string | null;
  note?: string;
  /** Share of the bar under the figure, 0 to 1. */
  fill?: number | null;
}): ReactElement {
  return (
    <div
      data-stat-tile
      className="relative flex min-h-26 flex-col justify-start gap-3 overflow-hidden rounded-lg border border-border bg-surface p-4 shadow-sm"
    >
      <div className={`absolute inset-x-0 top-0 h-[3px] ${BAR[tone]}`} />
      <div className="flex items-center justify-between gap-1">
        <span className={`text-[11px] font-semibold uppercase tracking-wider ${LABEL_TONE[tone]}`}>
          {label}
        </span>
        {chip === undefined || chip === null ? (
          <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-fg-faint">
            {icon}
          </span>
        ) : (
          <span
            className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-body-code text-[10px] font-semibold ${CHIP_TONE[tone]}`}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[12px]">
              {icon}
            </span>
            {chip}
          </span>
        )}
      </div>
      <div className="flex items-baseline justify-between gap-space-sm">
        {value === undefined ? (
          <span className="text-body-default text-fg-muted">Loading…</span>
        ) : value === null ? (
          <span className="text-body-default text-fg-muted">Unavailable</span>
        ) : (
          <span className="font-body-code text-[26px] font-bold leading-none tracking-tight text-fg">
            {COUNT.format(value)}
          </span>
        )}
        {note !== undefined && (
          <span
            className={`font-body-code text-[11px] ${tone === 'primary' || tone === 'crit' ? 'text-fg-faint' : LABEL_TONE[tone]}`}
          >
            {note}
          </span>
        )}
      </div>
      <div aria-hidden="true" className="h-1 w-full overflow-hidden rounded-full bg-surface-3">
        <div
          className={`h-full rounded-full ${BAR[tone]}`}
          style={{ width: `${Math.round(Math.min(1, Math.max(0, fill ?? 0)) * 100)}%` }}
        />
      </div>
    </div>
  );
}

function ratio(part: number, whole: number): number | null {
  return whole === 0 ? null : part / whole;
}

/** Five tiles from `GET /domains/summary` under the program, search and findings filters. The
 * DNS segment is left out so the Resolved and Unresolved tiles keep their meaning. */
function SummaryTiles({ filter }: { filter: DomainFilter }): ReactElement {
  const summary = useDomainSummary(filter);
  const s = summary.data;
  const value = (pick: (v: DomainSummary) => number) =>
    summary.isError ? null : s === undefined ? undefined : pick(s);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Tile
        label="Total domains"
        icon="domain"
        tone="primary"
        value={value((v) => v.total)}
        note={s === undefined ? undefined : `${percent(s.in_scope, s.total) ?? '0%'} in scope`}
        fill={s === undefined ? null : ratio(s.in_scope, s.total)}
      />
      <Tile
        label="Resolved"
        icon="check_circle"
        tone="good"
        value={value((v) => v.resolved)}
        chip={s === undefined ? null : percent(s.resolved, s.total)}
        note={s === undefined ? undefined : `+${COUNT.format(s.resolved_new_24h)} today`}
        fill={s === undefined ? null : ratio(s.resolved, s.total)}
      />
      <Tile
        label="Unresolved"
        icon="error"
        tone="crit"
        value={value((v) => v.unresolved)}
        chip={s === undefined ? null : percent(s.unresolved, s.total)}
        note="NXDOMAIN/timeout"
        fill={s === undefined ? null : ratio(s.unresolved, s.total)}
      />
      <Tile
        label="With findings"
        icon="flag"
        tone="warn"
        value={value((v) => v.with_findings)}
        chip={s === undefined ? null : percent(s.with_findings, s.total)}
        note={s === undefined ? undefined : `${COUNT.format(s.with_critical)} critical`}
        fill={s === undefined ? null : ratio(s.with_findings, s.total)}
      />
      <Tile
        label="New in 24h"
        icon="bolt"
        tone="info"
        value={value((v) => v.new_24h)}
        chip={s === undefined ? null : 'Delta'}
        note={s === undefined ? undefined : delta(s)}
        fill={s === undefined ? null : ratio(s.new_24h, s.total)}
      />
    </div>
  );
}

/** The initial program comes from `?program_id=`; useSearchParams needs a Suspense boundary. */
export default function DomainsPage(): ReactElement {
  return (
    <Suspense>
      <DomainsScreen />
    </Suspense>
  );
}

function DomainsScreen(): ReactElement {
  const me = useMe();
  const { programs, nameOf } = useProgramOptions();
  const [programId, setProgramId] = useState(useQueryParam('program_id') ?? '');
  const [segment, setSegment] = useState<DnsSegment>('all');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [hasFindings, setHasFindings] = useState(false);
  const [sort, setSort] = useState<'name' | '-name'>('name');
  const [limit, setLimit] = useState(25);
  const { hidden, toggle: toggleColumn } = useHiddenColumns('domains');
  const [density, setDensity] = useState<Density>('comfortable');
  const [columnsOpen, setColumnsOpen] = useState(false);
  const { cursor, canGoBack, depth, goNext, goBack, reset } = useCursorStack();
  const selection = useSelection();
  const rememberNav = useRememberDomainNav();
  const closeColumns = useCallback(() => setColumnsOpen(false), []);

  // Every cursor and every selected row belongs to the previous result set.
  const clearSelection = selection.clear;
  const restart = useCallback(() => {
    reset();
    clearSelection();
  }, [reset, clearSelection]);

  // The search applies once typing pauses, so each keystroke does not fetch a page.
  useEffect(() => {
    const trimmed = search.trim();
    if (trimmed === q) return;
    const timer = setTimeout(() => {
      setQ(trimmed);
      restart();
    }, 300);
    return () => clearTimeout(timer);
  }, [search, q, restart]);

  const base: DomainFilter = {
    programId: programId === '' ? null : programId,
    q: q === '' ? null : q,
    hasFindings: hasFindings ? true : null,
  };
  const filter: DomainFilter = {
    ...base,
    dnsStatus: DNS_SEGMENTS[segment].values,
    sort,
    limit,
  };
  const domains = useDomains(filter, cursor);

  const rows = domains.data?.items ?? [];
  const canManage = me.data !== undefined && me.data.role !== 'user';
  const selectedIds = Array.from(selection.ids);

  // The preset stores the list's own query parameters (N10).
  const presetParams: Record<string, unknown> = {};
  if (base.programId) presetParams.program_id = base.programId;
  if (segment !== 'all') presetParams.dns_status = [...DNS_SEGMENTS[segment].values];
  if (base.q) presetParams.q = base.q;
  if (hasFindings) presetParams.has_findings = true;

  const applyPreset = (params: Readonly<Record<string, unknown>>) => {
    setProgramId(typeof params.program_id === 'string' ? params.program_id : '');
    setSegment(segmentOf(params.dns_status));
    const nextQ = typeof params.q === 'string' ? params.q : '';
    setSearch(nextQ);
    setQ(nextQ);
    setHasFindings(params.has_findings === true);
    restart();
  };

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
          <FilterPresets screen="domains" current={presetParams} onApply={applyPreset} />
          <a href={domainExportHref(filter)} download className={BUTTON}>
            <span aria-hidden="true" className={BUTTON_ICON}>
              download
            </span>
            <span>Export CSV</span>
          </a>
          {canManage && (
            <Link href="/manage" className={PRIMARY_BUTTON}>
              <span aria-hidden="true" className={PRIMARY_ICON}>
                add_circle
              </span>
              <span>Add Scope</span>
            </Link>
          )}
        </div>
      </div>

      <SummaryTiles filter={base} />

      <div className="flex w-full flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-space-sm border-b border-border bg-surface-2 px-4 py-2">
          <div className="flex flex-wrap items-center gap-space-sm">
            <div className="relative">
              <span
                aria-hidden="true"
                className="material-symbols-outlined pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[16px] text-fg-faint"
              >
                search
              </span>
              <input
                type="search"
                aria-label="Filter domains"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter domains… (e.g. *.example.com)"
                className={FIELD + ' w-64 pl-8 font-body-code'}
              />
            </div>
            <label className="flex items-center gap-1 rounded-sm border border-border bg-surface-2 pl-2.5 text-xs text-fg-muted">
              <span>Program:</span>
              <select
                id="domains-program"
                aria-label="Program"
                value={programId}
                onChange={(e) => {
                  setProgramId(e.target.value);
                  restart();
                }}
                className="h-8 bg-transparent pr-1.5 text-xs font-medium text-fg focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">{`All programs (${COUNT.format(programs.length)})`}</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <div className={SEGMENTS}>
              {(Object.keys(DNS_SEGMENTS) as DnsSegment[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={segment === value}
                  onClick={() => {
                    setSegment(value);
                    restart();
                  }}
                  className={segment === value ? SEGMENT_ON : SEGMENT_OFF}
                >
                  {DNS_SEGMENTS[value].label}
                </button>
              ))}
            </div>
            <label className="flex cursor-pointer items-center gap-1.5 rounded-sm border border-border bg-surface-2 px-2 py-1 text-[11px] text-fg-muted">
              <input
                type="checkbox"
                role="switch"
                checked={hasFindings}
                onChange={(e) => {
                  setHasFindings(e.target.checked);
                  restart();
                }}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className="relative h-4 w-7 rounded-full bg-surface-3 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-3 after:w-3 after:rounded-full after:bg-fg-muted after:transition-transform peer-checked:bg-primary-container peer-checked:after:translate-x-3 peer-checked:after:bg-accent-ink peer-focus-visible:ring-2 peer-focus-visible:ring-ring"
              />
              <span>Findings only</span>
            </label>
            {domains.data !== undefined && (
              <span className={COUNT_TAG}>
                {(domains.data.total_is_estimate ? '~' : '') +
                  `${COUNT.format(domains.data.total)} domains`}
              </span>
            )}
          </div>
          <div className="flex items-center gap-space-xs">
            <Popover
              open={columnsOpen}
              onClose={closeColumns}
              label="Columns"
              button={
                <button
                  type="button"
                  title="Column Display Configuration"
                  aria-label="Columns"
                  aria-expanded={columnsOpen}
                  onClick={() => setColumnsOpen((v) => !v)}
                  className={TOOL_BUTTON}
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                    view_column
                  </span>
                </button>
              }
            >
              <fieldset className="flex flex-col gap-1">
                <legend className="mb-1 px-1 text-label-caps uppercase tracking-wider text-fg-muted">
                  Columns
                </legend>
                {OPTIONAL_COLUMNS.map((column) => (
                  <label
                    key={column}
                    className="flex cursor-pointer items-center gap-2 rounded-sm px-1 py-0.5 text-xs text-fg hover:bg-surface-3"
                  >
                    <input
                      type="checkbox"
                      checked={!hidden.has(column)}
                      onChange={() => toggleColumn(column)}
                      className="h-3.5 w-3.5 accent-primary-container"
                    />
                    {column}
                  </label>
                ))}
              </fieldset>
            </Popover>
            <button
              type="button"
              title="Density Settings"
              aria-label="Compact rows"
              aria-pressed={density === 'compact'}
              onClick={() => setDensity((d) => (d === 'compact' ? 'comfortable' : 'compact'))}
              className={TOOL_BUTTON}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                {density === 'compact' ? 'density_small' : 'density_medium'}
              </span>
            </button>
            <button
              type="button"
              title="Refresh"
              aria-label="Refresh"
              onClick={() => void domains.refetch()}
              className={TOOL_BUTTON}
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
                <ScanButton assets={selection.assets} programName={nameOf} compact />
                <ExportSelected ids={selectedIds} />
                <TagSelected ids={selectedIds} onDone={() => undefined} />
                {canManage && <DeleteSelected ids={selectedIds} onDone={selection.clear} />}
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
              hidden={hidden}
              density={density}
              sort={sort}
              onSort={() => {
                setSort((v) => (v === 'name' ? '-name' : 'name'));
                restart();
              }}
              onOpen={() =>
                rememberNav({
                  ids: rows.map((r) => r.id),
                  start: depth * limit + 1,
                  total: domains.data.total,
                  totalIsEstimate: domains.data.total_is_estimate,
                })
              }
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
              shown={rows.length}
              start={depth * limit + 1}
              noun="domains"
              pageSize={limit}
              onPageSizeChange={(size) => {
                setLimit(size);
                restart();
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
          </div>
        )}
      </div>
    </div>
  );
}
