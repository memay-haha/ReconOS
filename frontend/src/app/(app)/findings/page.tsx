'use client';

import { type ReactElement, useState } from 'react';

import { Pagination, useCursorStack } from '@/components/pagination';
import {
  BULK_TRIAGE_MAX,
  EXPORT_FORMATS,
  type FindingFilter,
  findingExportHref,
  SEVERITY_LABEL,
  TRIAGE_LABEL,
  TRIAGE_STATUSES,
  type TriageStatus,
  useBulkTriage,
  useFindings,
} from '@/lib/findings';
import { type Severity, SEVERITIES, usePrograms } from '@/lib/programs';

import { ALERT_TEXT, PANEL, STATE_TEXT } from '../system/modal';
import { loadErrorText, PageHeader, saveErrorText } from '../system/states';
import { FindingDrawer } from './finding-drawer';
import { FindingTable } from './finding-table';

const COUNT = new Intl.NumberFormat('en-US');

const EXPORT_LABEL: Readonly<Record<(typeof EXPORT_FORMATS)[number], string>> = {
  csv: 'CSV',
  jsonl: 'JSONL',
  md: 'Markdown',
};

const SELECT =
  'h-8 rounded-sm border border-border bg-surface px-2.5 text-caption text-fg focus:border-primary-container focus:outline-none focus:ring-2 focus:ring-ring';
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

/** S20. Every role triages, on the programs it can see; the backend enforces that. */
export default function FindingsPage(): ReactElement {
  const [programId, setProgramId] = useState('');
  const [severity, setSeverity] = useState<readonly Severity[]>([]);
  const [triage, setTriage] = useState<TriageStatus | ''>('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [bulkDone, setBulkDone] = useState<number | null>(null);
  const { cursor, canGoBack, goNext, goBack, reset } = useCursorStack();
  const programs = usePrograms({ limit: 200 });
  const bulk = useBulkTriage();

  const filter: FindingFilter = {
    programId: programId === '' ? null : programId,
    severity: severity.length === 0 ? null : severity,
    triageStatus: triage === '' ? null : triage,
  };
  const findings = useFindings(filter, cursor);

  const names = new Map((programs.data?.items ?? []).map((p) => [p.id, p.name]));
  const programName = (id: string) => names.get(id) ?? id.slice(0, 8);

  // Every cursor and every selection belongs to the result set it was taken from.
  const refilter = () => {
    reset();
    setSelected(new Set());
    setBulkDone(null);
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
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelected((current) =>
      items.every((f) => current.has(f.id)) ? new Set() : new Set(items.map((f) => f.id)),
    );

  const markConfirmed = () => {
    const ids = [...selected];
    if (ids.length === 0 || ids.length > BULK_TRIAGE_MAX) return;
    setBulkDone(null);
    bulk.mutate(
      { ids, triage_status: 'confirmed' },
      {
        onSuccess: () => {
          setBulkDone(ids.length);
          setSelected(new Set());
        },
      },
    );
  };

  return (
    <div className="flex w-full flex-col gap-space-lg">
      <PageHeader
        title="Findings"
        description="Findings from every program you can see. Triage them, or export the current filter."
      >
        <div className="flex flex-wrap items-center gap-space-sm">
          {EXPORT_FORMATS.map((format) => (
            <a
              key={format}
              href={findingExportHref(filter, format)}
              download
              className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-border-strong bg-surface px-3 text-panel-title text-fg hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <span
                aria-hidden="true"
                className="material-symbols-outlined text-icon text-fg-muted"
              >
                download
              </span>
              Export {EXPORT_LABEL[format]}
            </a>
          ))}
        </div>
      </PageHeader>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-space-sm rounded-sm border border-border-strong bg-surface-3 p-2.5">
          <div className="flex items-center gap-2 font-body-code text-body-default">
            <span className="font-semibold text-fg">{COUNT.format(selected.size)} selected</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={markConfirmed}
              disabled={bulk.isPending || selected.size > BULK_TRIAGE_MAX}
              className="inline-flex h-7 items-center gap-1 rounded-sm border border-border bg-surface px-2.5 text-caption font-semibold text-fg hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-icon text-info">
                verified
              </span>
              {bulk.isPending ? 'Saving…' : 'Mark confirmed'}
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="h-7 rounded-sm px-2 font-body-code text-caption text-fg-muted hover:bg-crit-soft hover:text-crit focus:outline-none focus:ring-2 focus:ring-ring"
            >
              Deselect
            </button>
          </div>
        </div>
      )}
      {bulkDone !== null && (
        <p role="status" className="text-body-default text-good">
          Marked {COUNT.format(bulkDone)} {bulkDone === 1 ? 'finding' : 'findings'} confirmed.
        </p>
      )}
      {bulk.isError && (
        <p role="alert" className="text-body-default text-crit">
          {saveErrorText(bulk.error)} No finding was changed.
        </p>
      )}

      <div className="flex w-full flex-col items-start gap-space-md xl:flex-row">
        <div className={PANEL}>
          {/* Filters sit on top of the table, in the same panel, as the mockup draws them. */}
          <div className="flex flex-col-reverse gap-space-sm md:flex-row-reverse md:items-center md:justify-between border-b border-border bg-surface-2/40 p-space-md">
            <div className="flex flex-wrap items-center justify-end gap-space-sm">
              <label htmlFor="finding-program" className="sr-only">
                Program
              </label>
              <select
                id="finding-program"
                value={programId}
                onChange={(e) => {
                  setProgramId(e.target.value);
                  refilter();
                }}
                className={SELECT}
              >
                <option value="">All programs</option>
                {(programs.data?.items ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
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
                <option value="">All statuses</option>
                {TRIAGE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {TRIAGE_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
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
                All
              </button>
              {SEVERITIES.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={severity.includes(s)}
                  onClick={() => toggleSeverity(s)}
                  className={severity.includes(s) ? SEG_ON[s] : SEG_OFF}
                >
                  {SEVERITY_LABEL[s]}
                </button>
              ))}
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
                  selected={selected}
                  openId={openId}
                  onToggle={toggle}
                  onToggleAll={toggleAll}
                  onOpen={setOpenId}
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
                  canGoBack={canGoBack}
                  onBack={() => {
                    goBack();
                    setSelected(new Set());
                  }}
                  onNext={() => {
                    goNext(findings.data.next_cursor);
                    setSelected(new Set());
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
    </div>
  );
}
