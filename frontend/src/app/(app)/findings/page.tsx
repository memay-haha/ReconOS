'use client';

import { type ReactElement, Suspense, useDeferredValue, useEffect, useRef, useState } from 'react';

import { Pagination, useCursorStack } from '@/components/pagination';
import { useQueryParam } from '@/lib/url-params';
import { useDomains } from '@/lib/domains';
import {
  BULK_TRIAGE_MAX,
  type ExportFormat,
  type FindingFilter,
  findingExportHref,
  type FindingRow,
  SEVERITY_LABEL,
  TRIAGE_LABEL,
  TRIAGE_STATUSES,
  type TriageStatus,
  useBulkTriage,
  useCopyFindingMarkdown,
  useFindings,
  useFindingSummary,
  usePatchFinding,
} from '@/lib/findings';
import { useCreateJob } from '@/lib/jobs';
import { type Severity, SEVERITIES, usePrograms } from '@/lib/programs';
import { useToolModules } from '@/lib/tool-modules';

import { ALERT_TEXT, PANEL, STATE_TEXT } from '../system/modal';
import { loadErrorText, saveErrorText } from '../system/states';
import { FindingDrawer } from './finding-drawer';
import { FindingTable } from './finding-table';
import {
  BULK_BUTTON,
  HEADER_BUTTON,
  SELECT,
  SEVERITY_BAR,
  SEVERITY_ICON,
  SEVERITY_TEXT,
  SEVERITY_TILE_LABEL,
  TRIAGE_DOT,
} from './tones';

const COUNT = new Intl.NumberFormat('en-US');
const PERCENT = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 });

const EXPORTS: readonly (readonly [ExportFormat, string, string])[] = [
  ['jsonl', 'JSONL Format', '.jsonl'],
  ['csv', 'CSV Table', '.csv'],
  ['md', 'Markdown Dossier', '.md'],
];

const SEG = 'whitespace-nowrap rounded-sm px-2.5 py-1 font-body-code text-caption';
const SEG_OFF = `${SEG} text-fg-muted hover:text-fg`;
const SEG_ALL_ON = `${SEG} bg-surface-3 font-semibold text-primary`;
/** A pressed severity takes its own tint, as the mockup's Critical tab does. */
const SEG_ON: Readonly<Record<Severity, string>> = {
  critical: `${SEG} bg-crit-strong-soft font-semibold text-crit`,
  high: `${SEG} bg-crit-soft font-semibold text-crit`,
  medium: `${SEG} bg-warn-soft font-semibold text-warn`,
  low: `${SEG} bg-info-soft font-semibold text-info`,
  info: `${SEG} bg-neutral-soft font-semibold text-fg`,
};

/** Every status but False positive: what Hide False Positives sends as `triage_status` (C2). */
const WITHOUT_FP = TRIAGE_STATUSES.filter((s) => s !== 'false_positive');

function Icon({ name }: { name: string }): ReactElement {
  return (
    <span aria-hidden="true" className="material-symbols-outlined text-icon">
      {name}
    </span>
  );
}

/** The header's Export menu: one link per format, carrying the current filter. */
function ExportMenu({ filter }: { filter: FindingFilter }): ReactElement {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === 'Escape'
          : !ref.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block text-left">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={HEADER_BUTTON}
      >
        <span aria-hidden="true" className="material-symbols-outlined text-icon text-fg-muted">
          download
        </span>
        Export
        <span aria-hidden="true" className="material-symbols-outlined text-icon text-fg-faint">
          arrow_drop_down
        </span>
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Export format"
          className="absolute right-0 z-30 mt-1.5 flex w-48 flex-col rounded-sm border border-border-strong bg-surface py-1 shadow-modal"
        >
          {EXPORTS.map(([format, label, ext]) => (
            <a
              key={format}
              role="menuitem"
              href={findingExportHref(filter, format)}
              download
              onClick={() => setOpen(false)}
              className="flex items-center justify-between px-3 py-1.5 text-body-default text-fg hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"
            >
              {label}
              <span className="font-body-code text-caption text-fg-faint">{ext}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/** S20. Every role triages, on the programs it can see; the backend enforces that. */
/** The initial program comes from `?program_id=`; useSearchParams needs a Suspense boundary. */
export default function FindingsPage(): ReactElement {
  return (
    <Suspense>
      <FindingsScreen />
    </Suspense>
  );
}

function FindingsScreen(): ReactElement {
  const [q, setQ] = useState('');
  const query = useDeferredValue(q.trim());
  const [programId, setProgramId] = useState(useQueryParam('program_id') ?? '');
  const [domainId, setDomainId] = useState('');
  const [severity, setSeverity] = useState<readonly Severity[]>([]);
  const [triage, setTriage] = useState<TriageStatus | ''>('');
  const [hideFp, setHideFp] = useState(false);
  const [limit, setLimit] = useState(10);
  const [selected, setSelected] = useState<ReadonlyMap<string, FindingRow>>(new Map());
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const { cursor, canGoBack, depth, goNext, goBack, reset } = useCursorStack();
  const programs = usePrograms({ limit: 200 });
  const domains = useDomains({ programId, limit: 200 }, null, { enabled: programId !== '' });
  const toolModules = useToolModules();
  const bulk = useBulkTriage();
  const patch = usePatchFinding();
  const copy = useCopyFindingMarkdown();
  const createJob = useCreateJob();
  const [rescanning, setRescanning] = useState(false);

  let triageStatus: readonly TriageStatus[] | null = null;
  if (triage !== '') triageStatus = [triage];
  else if (hideFp) triageStatus = WITHOUT_FP;

  // The tiles and pills count every severity under the other filters, so they stay put while
  // the reader switches severity; the list takes every filter.
  const base: FindingFilter = {
    programId: programId === '' ? null : programId,
    domainId: domainId === '' ? null : domainId,
    triageStatus,
    q: query === '' ? null : query,
  };
  const filter: FindingFilter = { ...base, severity: severity.length === 0 ? null : severity };
  const findings = useFindings({ ...filter, limit }, cursor);
  const summary = useFindingSummary(base);

  const names = new Map((programs.data?.items ?? []).map((p) => [p.id, p.name]));
  const programName = (id: string) => names.get(id) ?? id.slice(0, 8);
  const byProgram = new Map((summary.data?.by_program ?? []).map((p) => [p.program_id, p.count]));

  // Every cursor and every selection belongs to the result set it was taken from.
  const refilter = () => {
    reset();
    setSelected(new Map());
    setNote(null);
  };

  const toggleSeverity = (s: Severity) => {
    setSeverity((current) =>
      current.includes(s)
        ? current.filter((x) => x !== s)
        : SEVERITIES.filter((x) => x === s || current.includes(x)),
    );
    refilter();
  };

  const items = findings.data?.items ?? [];
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Map(current);
      const row = items.find((f) => f.id === id);
      if (next.has(id)) next.delete(id);
      else if (row !== undefined) next.set(id, row);
      return next;
    });
  const selectPage = () => setSelected(new Map(items.map((f) => [f.id, f])));
  const toggleAll = () =>
    items.every((f) => selected.has(f.id)) ? setSelected(new Map()) : selectPage();

  const ids = [...selected.keys()];
  const programsInBatch = new Set([...selected.values()].map((f) => f.program_id)).size;

  const markAll = (status: TriageStatus) => {
    if (ids.length === 0 || ids.length > BULK_TRIAGE_MAX) return;
    setNote(null);
    bulk.mutate(
      { ids, triage_status: status },
      {
        onSuccess: () => {
          setNote(
            `Marked ${COUNT.format(ids.length)} ${ids.length === 1 ? 'finding' : 'findings'} ${TRIAGE_LABEL[status].toLowerCase()}.`,
          );
          setSelected(new Map());
        },
      },
    );
  };

  /** P2 (replaces N49): re-run the tool module that found each selected finding on its target, one job per
   * program and tool module. The backend checks scope for every target. */
  const rescan = async () => {
    const modules = new Map((toolModules.data?.items ?? []).map((m) => [m.name, m.id]));
    const groups = new Map<
      string,
      { programId: string; toolModuleId: string; targets: Set<string> }
    >();
    for (const f of selected.values()) {
      const toolModuleId = modules.get(f.tool_module_name);
      const target = f.matched_at ?? f.asset?.name;
      if (toolModuleId === undefined || target === undefined) continue;
      const key = `${f.program_id}:${toolModuleId}`;
      const group = groups.get(key) ?? {
        programId: f.program_id,
        toolModuleId,
        targets: new Set(),
      };
      group.targets.add(target);
      groups.set(key, group);
    }
    setNote(null);
    setRescanning(true);
    let created = 0;
    try {
      for (const g of groups.values()) {
        await createJob.mutateAsync({
          program_id: g.programId,
          tool_module_id: g.toolModuleId,
          target: [...g.targets],
        });
        created += 1;
      }
      setNote(
        `Created ${COUNT.format(created)} ${created === 1 ? 'job' : 'jobs'} to re-scan the selection.`,
      );
      setSelected(new Map());
    } catch {
      // The mutation keeps the error; the alert below names it.
    } finally {
      setRescanning(false);
    }
  };

  const copyMarkdown = (id: string) =>
    copy.mutate([id], {
      onSuccess: () => setNote('Markdown copied.'),
      onError: () => setNote(null),
    });

  const total = summary.data?.total;
  const severityWord =
    severity.length === 0
      ? 'findings'
      : severity.map((s) => SEVERITY_LABEL[s].toLowerCase()).join(', ');

  return (
    <div className="flex w-full flex-col gap-space-lg">
      <div className="flex flex-col justify-between gap-space-md pt-space-xs lg:flex-row lg:items-end">
        <div className="flex flex-col gap-space-xs">
          <h1 className="text-headline-lg tracking-tight text-fg">Findings</h1>
          <p className="max-w-3xl text-body-default text-fg-muted">
            Findings from every program you can see, from every tool module that reports them. Total{' '}
            <span className="font-semibold text-fg">
              {total === undefined ? '-' : COUNT.format(total)} findings
            </span>{' '}
            indexed.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-space-sm">
          <ExportMenu filter={filter} />
          <button
            type="button"
            onClick={selectPage}
            disabled={items.length === 0}
            className={HEADER_BUTTON}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-icon text-fg-muted">
              checklist_rtl
            </span>
            Bulk Triage
          </button>
          <button
            type="button"
            onClick={() => void rescan()}
            disabled={selected.size === 0 || rescanning || toolModules.data === undefined}
            title="Re-run the tool module of each selected finding on its target"
            className="inline-flex h-9 items-center gap-1.5 rounded-sm bg-primary-container px-3.5 text-panel-title font-semibold text-accent-ink hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
          >
            <Icon name="sync" />
            {rescanning ? 'Re-scanning…' : 'Re-scan'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-space-sm md:grid-cols-3 xl:grid-cols-5">
        {SEVERITIES.map((s) => {
          const fresh = summary.data?.new_24h_by_severity[s] ?? 0;
          return (
            <div
              key={s}
              className={
                s === 'info'
                  ? 'relative col-span-2 flex flex-col justify-between overflow-hidden rounded-sm border border-border bg-surface p-space-md md:col-span-1'
                  : 'relative flex flex-col justify-between overflow-hidden rounded-sm border border-border bg-surface p-space-md'
              }
            >
              <div className={`absolute inset-x-0 top-0 h-[3px] ${SEVERITY_BAR[s]}`} />
              <div className="flex items-center justify-between">
                <span className={`text-label-caps uppercase tracking-wider ${SEVERITY_TEXT[s]}`}>
                  {SEVERITY_TILE_LABEL[s]}
                </span>
                <span
                  aria-hidden="true"
                  className={`material-symbols-outlined text-icon ${SEVERITY_TEXT[s]}`}
                >
                  {SEVERITY_ICON[s]}
                </span>
              </div>
              <p className="my-2 text-stat-lg tracking-tight text-fg">
                {summary.data === undefined ? '-' : COUNT.format(summary.data.by_severity[s])}
              </p>
              <p
                className={
                  fresh > 0
                    ? 'flex items-center gap-1 font-body-code text-caption text-crit'
                    : 'flex items-center gap-1 font-body-code text-caption text-fg-faint'
                }
              >
                <Icon name={fresh > 0 ? 'arrow_upward' : 'remove'} />+{COUNT.format(fresh)} new in
                24h
              </p>
            </div>
          );
        })}
      </div>
      {summary.isError && (
        <p role="alert" className="text-body-default text-crit">
          {loadErrorText(summary.error, 'finding counts')}
        </p>
      )}

      <div className="flex flex-col justify-between gap-space-md rounded-sm border border-border bg-surface p-space-md lg:flex-row lg:items-center">
        <div className="flex-1">
          <div className="mb-2 flex items-center justify-between font-body-code text-caption">
            <span className="font-semibold uppercase text-fg">Severity Spectrum Breakdown</span>
            <span className="text-fg-faint">
              Total: {total === undefined ? '-' : COUNT.format(total)} Findings
            </span>
          </div>
          <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-surface-2">
            {total !== undefined &&
              total > 0 &&
              SEVERITIES.map((s) => {
                const n = summary.data?.by_severity[s] ?? 0;
                if (n === 0) return null;
                return (
                  <div
                    key={s}
                    title={`${SEVERITY_LABEL[s]}: ${COUNT.format(n)} (${PERCENT.format(n / total)})`}
                    style={{ width: `${(n / total) * 100}%` }}
                    className={`h-full ${SEVERITY_BAR[s]}`}
                  />
                );
              })}
          </div>
          <ul className="mt-2 flex flex-wrap items-center gap-3 font-body-code text-caption">
            {SEVERITIES.map((s) => (
              <li key={s} className={`flex items-center gap-1 ${SEVERITY_TEXT[s]}`}>
                <span aria-hidden="true" className={`h-2 w-2 rounded-sm ${SEVERITY_BAR[s]}`} />
                {SEVERITY_LABEL[s]} {COUNT.format(summary.data?.by_severity[s] ?? 0)}
              </li>
            ))}
          </ul>
        </div>
        <div aria-hidden="true" className="hidden h-12 w-px bg-border lg:block" />
        <ul aria-label="Triage status" className="flex flex-wrap items-center gap-space-sm">
          {TRIAGE_STATUSES.map((s) => (
            <li
              key={s}
              className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-2.5 py-1"
            >
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${TRIAGE_DOT[s]}`} />
              <span
                className={
                  s === 'false_positive'
                    ? 'text-caption text-fg-muted line-through'
                    : 'text-caption text-fg-muted'
                }
              >
                {TRIAGE_LABEL[s]}
              </span>
              <span className="font-body-code text-body-code font-semibold text-fg">
                {COUNT.format(summary.data?.by_triage_status[s] ?? 0)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-col items-center justify-between gap-space-sm rounded-sm border border-border-strong bg-surface-3 p-2.5 sm:flex-row">
          <div className="flex flex-wrap items-center gap-2 font-body-code text-body-default">
            <span className="flex h-5 min-w-5 items-center justify-center rounded-sm bg-primary-container px-1 text-caption font-bold text-accent-ink">
              {COUNT.format(selected.size)}
            </span>
            <span className="font-semibold text-fg">
              {selected.size === 1 ? 'finding selected' : 'findings selected'}
            </span>
            <span className="text-caption text-fg-faint">
              | Across {COUNT.format(programsInBatch)}{' '}
              {programsInBatch === 1 ? 'program' : 'programs'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => markAll('confirmed')}
              disabled={bulk.isPending || selected.size > BULK_TRIAGE_MAX}
              className={BULK_BUTTON}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-icon text-info">
                verified
              </span>
              {bulk.isPending ? 'Saving…' : 'Mark confirmed'}
            </button>
            <button
              type="button"
              onClick={() => markAll('false_positive')}
              disabled={bulk.isPending || selected.size > BULK_TRIAGE_MAX}
              className={BULK_BUTTON}
            >
              <span
                aria-hidden="true"
                className="material-symbols-outlined text-icon text-fg-faint"
              >
                block
              </span>
              False Positive
            </button>
            <a href={findingExportHref(filter, 'csv', ids)} download className={BULK_BUTTON}>
              <Icon name="file_download" />
              Export
            </a>
            <button
              type="button"
              onClick={() => setSelected(new Map())}
              className="ml-1 h-7 rounded-sm px-2 font-body-code text-caption text-fg-muted hover:bg-crit-soft hover:text-crit focus:outline-none focus:ring-2 focus:ring-ring"
            >
              Deselect
            </button>
          </div>
        </div>
      )}
      {note !== null && (
        <p role="status" className="text-body-default text-good">
          {note}
        </p>
      )}
      {bulk.isError && (
        <p role="alert" className="text-body-default text-crit">
          {saveErrorText(bulk.error)} No finding was changed.
        </p>
      )}
      {patch.isError && (
        <p role="alert" className="text-body-default text-crit">
          {saveErrorText(patch.error)}
        </p>
      )}
      {createJob.isError && (
        <p role="alert" className="text-body-default text-crit">
          Could not create every re-scan job. A target may be outside the program scope.
        </p>
      )}
      {copy.isError && (
        <p role="alert" className="text-body-default text-crit">
          Could not copy the Markdown report.
        </p>
      )}

      <div className={PANEL}>
        {/* Filters sit on top of the table, in the same panel, as the mockup draws them. */}
        <div className="flex flex-col gap-space-sm border-b border-border bg-surface-2/40 p-space-md">
          <div className="flex flex-col items-stretch justify-between gap-space-sm lg:flex-row lg:items-center">
            <div className="relative max-w-xl flex-1">
              <span
                aria-hidden="true"
                className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-icon text-fg-faint"
              >
                search
              </span>
              <input
                type="text"
                aria-label="Filter findings"
                placeholder="Filter by finding name, template ID, CVE, matched at..."
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  refilter();
                }}
                className="h-8 w-full rounded-sm border border-border-strong bg-surface pl-9 pr-3 font-body-code text-body-code text-fg placeholder:text-fg-faint focus:border-primary-container focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="finding-program" className="sr-only">
                Program
              </label>
              <select
                id="finding-program"
                value={programId}
                onChange={(e) => {
                  setProgramId(e.target.value);
                  setDomainId('');
                  refilter();
                }}
                className={SELECT}
              >
                <option value="">
                  All Programs ({COUNT.format(programs.data?.items.length ?? 0)})
                </option>
                {(programs.data?.items ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {byProgram.has(p.id)
                      ? `${p.name} (${COUNT.format(byProgram.get(p.id) ?? 0)})`
                      : p.name}
                  </option>
                ))}
              </select>
              <label htmlFor="finding-domain" className="sr-only">
                Domain
              </label>
              <select
                id="finding-domain"
                value={domainId}
                disabled={programId === ''}
                title={programId === '' ? 'Choose a program first' : undefined}
                onChange={(e) => {
                  setDomainId(e.target.value);
                  refilter();
                }}
                className={SELECT}
              >
                <option value="">
                  {domains.data === undefined
                    ? 'All Domains'
                    : `All Domains (${COUNT.format(domains.data.total)})`}
                </option>
                {(domains.data?.items ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <label htmlFor="finding-triage" className="sr-only">
                Status
              </label>
              <select
                id="finding-triage"
                value={triage}
                onChange={(e) => {
                  setTriage(e.target.value as TriageStatus | '');
                  refilter();
                }}
                className={SELECT}
              >
                <option value="">Status: All</option>
                {TRIAGE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    Status: {TRIAGE_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-col items-start justify-between gap-space-sm pt-1 md:flex-row md:items-center">
            <div
              role="group"
              aria-label="Severity"
              className="flex max-w-full items-center overflow-x-auto rounded-sm border border-border bg-surface-2 p-0.5"
            >
              <button
                type="button"
                aria-pressed={severity.length === 0}
                onClick={() => {
                  setSeverity([]);
                  refilter();
                }}
                className={severity.length === 0 ? SEG_ALL_ON : SEG_OFF}
              >
                All ({total === undefined ? '-' : COUNT.format(total)})
              </button>
              {SEVERITIES.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={severity.includes(s)}
                  onClick={() => toggleSeverity(s)}
                  className={severity.includes(s) ? SEG_ON[s] : SEG_OFF}
                >
                  {SEVERITY_LABEL[s]} (
                  {summary.data === undefined ? '-' : COUNT.format(summary.data.by_severity[s])})
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-space-md">
              <label className="flex cursor-pointer items-center gap-2 text-caption text-fg-muted">
                <input
                  type="checkbox"
                  role="switch"
                  checked={hideFp}
                  onChange={(e) => {
                    setHideFp(e.target.checked);
                    refilter();
                  }}
                  className="relative h-4 w-8 shrink-0 cursor-pointer appearance-none rounded-full border border-border-strong bg-surface-2 before:absolute before:left-0.5 before:top-0.5 before:h-2.5 before:w-2.5 before:rounded-full before:bg-fg-muted before:transition-transform checked:border-primary-container checked:bg-primary-container checked:before:translate-x-4 checked:before:bg-accent-ink focus:outline-none focus:ring-2 focus:ring-ring"
                />
                Hide False Positives
              </label>
              {findings.data !== undefined && (
                <span className="rounded-sm border border-border-strong bg-surface-3 px-2 py-0.5 font-body-code text-caption text-primary">
                  Showing {COUNT.format(items.length)} of {COUNT.format(findings.data.total)}{' '}
                  {severityWord}
                </span>
              )}
            </div>
          </div>
        </div>
        {findings.isPending && <p className={STATE_TEXT}>Loading the findings…</p>}
        {findings.isError && (
          <p role="alert" className={ALERT_TEXT}>
            {loadErrorText(findings.error, 'finding list')}
          </p>
        )}
        {findings.data !== undefined && (
          <>
            {items.length === 0 ? (
              <p className={STATE_TEXT}>No findings match.</p>
            ) : (
              <FindingTable
                findings={items}
                programName={programName}
                selected={new Set(ids)}
                openId={openId}
                busy={patch.isPending}
                onToggle={toggle}
                onToggleAll={toggleAll}
                onOpen={setOpenId}
                onCopy={copyMarkdown}
                onStatus={(f, status) => {
                  setNote(null);
                  patch.mutate(
                    { findingId: f.id, body: { triage_status: status, duplicate_of_id: null } },
                    { onSuccess: () => setNote(`${f.name}: ${TRIAGE_LABEL[status]}.`) },
                  );
                }}
              />
            )}
            <div className="border-t border-border bg-surface-2 px-space-md">
              <Pagination
                label="Finding list pagination"
                page={{
                  total: findings.data.total,
                  totalIsEstimate: findings.data.total_is_estimate,
                  nextCursor: findings.data.next_cursor,
                }}
                shown={items.length}
                start={depth * limit + 1}
                noun="findings"
                pageSize={limit}
                onPageSizeChange={(size) => {
                  setLimit(size);
                  refilter();
                }}
                canGoBack={canGoBack}
                onBack={() => {
                  goBack();
                  setSelected(new Map());
                }}
                onNext={() => {
                  goNext(findings.data.next_cursor);
                  setSelected(new Map());
                }}
              />
            </div>
          </>
        )}
      </div>
      {openId !== null && (
        <FindingDrawer
          key={openId}
          findingId={openId}
          programName={programName}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}
