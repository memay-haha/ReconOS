'use client';

import Link from 'next/link';
import { type FormEvent, Fragment, type ReactElement, useState } from 'react';

import { Pagination, useCursorStack } from '@/components/pagination';
import { RunScanDialog } from '@/components/run-scan-dialog';
import { useMe } from '@/lib/auth';
import { useDashboardSummary } from '@/lib/dashboard';
import { useDomains } from '@/lib/domains';
import { formatMoment } from '@/lib/format-moment';
import { useCreateJob } from '@/lib/jobs';
import {
  type ProgramBulkAction,
  type ProgramFilter,
  type ProgramRow,
  type ProgramStatus,
  useBulkProgramAction,
  usePrograms,
} from '@/lib/programs';
import { useCreateScopeRule, useScopeRules } from '@/lib/scope-rules';
import { useToolModules } from '@/lib/tool-modules';

import { ConfirmDialog } from '../programs/dialog';
import { errorText } from '../programs/error-text';
import { safeHref } from '../programs/links';
import { ProgramActions } from '../programs/program-actions';
import { ProgramForm } from '../programs/program-form';
import { type Figure, percentOf, totalOf } from '../programs/stat-tile';
import { PROGRAM_STATUS_LABEL } from '../programs/status-badge';
import { ALERT, COUNT, NOTE } from '../programs/ui';
import { useSettled } from '../programs/use-settled';

type StatusFilter = NonNullable<ProgramFilter['status']>;

/** The mockup's pills; Inactive is Paused (M2) and No Scope means no In-Scope rule. */
type Pill = 'all' | 'active' | 'paused' | 'no_scope';

const PILLS: readonly { value: Pill; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'no_scope', label: 'No Scope' },
];

const PILL_COUNT: Readonly<Record<Pill, string>> = {
  all: 'bg-surface-3 text-fg-muted',
  active: 'bg-good-soft text-good',
  paused: 'bg-surface-3 text-fg-muted',
  no_scope: 'bg-warn-soft text-warn',
};

/** Page size of the table; the mockup shows six programs a page. */
const LIMIT = 10;

const BULK_BUTTON =
  'inline-flex items-center gap-1 rounded-sm px-2 py-1 text-caption transition-colors focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60';

const BULK_LABEL: Readonly<Record<ProgramBulkAction, string>> = {
  resume: 'Resume Selected',
  pause: 'Pause Selected',
  archive: 'Archive Selected',
  delete: 'Delete',
};

const BULK_ICON: Readonly<Record<ProgramBulkAction, string>> = {
  resume: 'play_arrow',
  pause: 'pause',
  archive: 'inventory_2',
  delete: 'delete',
};

const BULK_TONE: Readonly<Record<ProgramBulkAction, string>> = {
  resume: 'text-good hover:bg-good-soft',
  pause: 'text-fg-muted hover:bg-surface-3 hover:text-fg',
  archive: 'text-fg-muted hover:bg-surface-3 hover:text-fg',
  delete: 'bg-crit-soft text-crit hover:bg-crit-strong-soft',
};

const QUICK_FIELD =
  'h-7 w-full rounded-sm bg-surface-2 px-2 font-body-code text-caption text-fg placeholder:text-fg-faint focus:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-ring sm:w-72';

// Class strings follow the S11 mockup (M7): a segmented status control, a compact table
// with right-aligned mono figures, chips for platform, status and scope counts.
const PILL =
  'flex items-center gap-1.5 rounded-sm px-2.5 py-1 font-panel-title text-panel-title text-fg-muted hover:bg-surface-3/50 hover:text-fg aria-pressed:bg-surface-3 aria-pressed:font-semibold aria-pressed:text-primary focus:outline-none focus:ring-2 focus:ring-ring';

const NEW_BUTTON =
  'flex items-center gap-1.5 rounded-sm bg-primary-container px-3 py-1.5 font-panel-title text-panel-title font-semibold text-accent-ink shadow-sm hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-ring';

const SCOPE_BUTTON =
  'rounded-sm bg-surface-2 px-2 py-0.5 font-body-code text-[11px] text-fg-muted hover:bg-surface-bright hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring';

const SCOPE_BUTTON_WARN =
  'rounded-sm bg-warn-soft px-2 py-0.5 font-body-code text-[11px] text-warn hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring';

const TH = 'px-3.5 py-2 text-left font-label-caps text-label-caps uppercase text-fg-muted';
const TH_CENTER = 'px-3.5 py-2 text-center font-label-caps text-label-caps uppercase text-fg-muted';
const TH_NUM = 'px-3.5 py-2 text-right font-label-caps text-label-caps uppercase text-fg-muted';
const TD = 'px-3.5 py-2.5 align-middle';
const TD_NUM = 'px-3.5 py-2.5 text-right align-middle font-body-code text-body-code';

// Flat lookup tables: the contrast scanner reads a table but not a property of its entry.
const STATUS_CHIP: Readonly<Record<ProgramStatus, string>> = {
  active: 'bg-good-soft text-good',
  paused: 'bg-warn-soft text-warn',
  archived: 'bg-neutral-soft text-fg-muted',
};

const STATUS_DOT: Readonly<Record<ProgramStatus, string>> = {
  active: 'bg-good',
  paused: 'bg-warn',
  archived: 'bg-fg-faint',
};

type TileTone = 'primary' | 'good' | 'warn' | 'info';

const TILE_BORDER: Readonly<Record<TileTone, string>> = {
  primary: 'border-primary-container',
  good: 'border-good',
  warn: 'border-warn',
  info: 'border-info',
};
const TILE_ICON: Readonly<Record<TileTone, string>> = {
  primary: 'text-primary',
  good: 'text-good',
  warn: 'text-warn',
  info: 'text-info',
};
const TILE_VALUE: Readonly<Record<TileTone, string>> = {
  primary: 'text-fg',
  good: 'text-good',
  warn: 'text-warn',
  info: 'text-fg',
};

/** The mockup's KPI card: a coloured top edge, the figure followed by its unit in mono. */
function KpiTile({
  label,
  icon,
  tone,
  value,
  unit,
  note,
  noteIcon,
}: {
  label: string;
  icon: string;
  tone: TileTone;
  value: Figure;
  unit: string;
  note: string | null;
  noteIcon: string;
}): ReactElement {
  return (
    <div
      data-stat-tile
      className={`relative flex flex-col justify-between overflow-hidden rounded-sm border-t-2 bg-surface p-space-lg shadow-sm ${TILE_BORDER[tone]}`}
    >
      <div className="flex items-center justify-between">
        <span className="font-label-caps text-label-caps uppercase text-fg-faint">{label}</span>
        <span
          aria-hidden="true"
          className={`material-symbols-outlined text-[18px] ${TILE_ICON[tone]}`}
        >
          {icon}
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        {value === undefined ? (
          <span className="text-body-default text-fg-muted">Loading…</span>
        ) : value === null ? (
          <span className="text-body-default text-fg-muted">Unavailable</span>
        ) : (
          <>
            <span className={`font-stat-lg text-stat-lg ${TILE_VALUE[tone]}`}>
              {COUNT.format(value)}
            </span>
            <span className="font-body-code text-body-code text-fg-muted">{unit}</span>
          </>
        )}
      </div>
      <p className={`mt-1 flex items-center gap-1 font-caption text-caption ${TILE_ICON[tone]}`}>
        <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
          {noteIcon}
        </span>
        {note ?? '-'}
      </p>
    </div>
  );
}

/** Expanded row (M28): add a wildcard in place, the first three In-Scope rules with the
 * domains each matches, and a link to the full list on S09. */
function ScopePreview({
  program,
  canManage,
}: {
  program: ProgramRow;
  canManage: boolean;
}): ReactElement {
  const rules = useScopeRules(program.id);
  const create = useCreateScopeRule(program.id);
  const [value, setValue] = useState('');
  const inScope = (rules.data?.items ?? []).filter((r) => r.scope_type === 'in_scope');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate(
      { scope_type: 'in_scope', rule_type: 'wildcard', value: value.trim(), reason: null },
      { onSuccess: () => setValue('') },
    );
  };
  return (
    <div className="flex flex-col gap-space-sm">
      <div className="flex flex-col justify-between gap-space-sm md:flex-row md:items-center">
        <span className="font-label-caps text-label-caps uppercase tracking-wider text-primary">
          In-Scope rules &amp; Out-of-Scope exclusions
        </span>
        {canManage && (
          <form onSubmit={submit} className="flex items-center gap-1" aria-label="Add wildcard">
            <label htmlFor={`wildcard-${program.id}`} className="sr-only">
              Wildcard
            </label>
            <input
              id={`wildcard-${program.id}`}
              value={value}
              placeholder="Add wildcard (e.g. *.example.com)"
              onChange={(e) => setValue(e.target.value)}
              className={QUICK_FIELD}
            />
            <button
              type="submit"
              disabled={create.isPending || value.trim() === ''}
              className="h-7 whitespace-nowrap rounded-sm bg-primary-container px-2.5 text-caption font-semibold text-accent-ink hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              Add Scope
            </button>
          </form>
        )}
      </div>
      {create.isError && (
        <p role="alert" className="text-caption text-crit-strong">
          {errorText(create.error, 'Could not add the wildcard.')}
        </p>
      )}
      {rules.isPending && <p className="text-caption text-fg-muted">Loading scope rules…</p>}
      {rules.isError && (
        <p role="alert" className="text-caption text-crit-strong">
          {errorText(rules.error, 'Could not load the scope rules.')}
        </p>
      )}
      {rules.data !== undefined && inScope.length === 0 && (
        <p className="text-caption text-warn">No In-Scope rule yet: jobs cannot be created.</p>
      )}
      {inScope.length > 0 && (
        <ul className="grid grid-cols-1 gap-space-sm md:grid-cols-3">
          {inScope.slice(0, 3).map((rule) => (
            <li
              key={rule.id}
              className="flex items-center justify-between gap-2 rounded-sm bg-surface-2 px-2.5 py-2"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-good" />
                <span className="truncate font-body-code text-caption text-fg">{rule.value}</span>
              </span>
              {rule.matched_domain_count !== undefined && (
                <span className="whitespace-nowrap rounded-sm bg-surface-3 px-1.5 font-body-code text-[11px] text-fg-muted">
                  {COUNT.format(rule.matched_domain_count)} domains
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col justify-between gap-space-xs text-caption md:flex-row md:items-center">
        {/* M5: the mockup said wildcards feed the queues; jobs are only created by hand or by
            schedule (docs/architecture/business-flow.md). */}
        <span className="flex items-center gap-1 text-fg-faint">
          <span aria-hidden="true" className="material-symbols-outlined text-[14px] text-warn">
            info
          </span>
          New assets do not create jobs. Jobs are created manually or by schedule.
        </span>
        <Link
          href={`/programs/${program.id}?tab=scope`}
          className="font-body-code text-primary hover:underline"
        >
          View full {COUNT.format(program.in_scope_rule_count + program.out_of_scope_rule_count)}{' '}
          definitions →
        </Link>
      </div>
    </div>
  );
}

/** S11: programs as a table, to pause, resume, archive and delete in bulk and edit scope. */
export default function ManagePage(): ReactElement {
  const me = useMe();
  const role = me.data?.role ?? null;
  const canManage = role === 'superadmin' || role === 'admin';
  const [pill, setPill] = useState<Pill>('all');
  const [unmapped, setUnmapped] = useState(false);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReadonlyMap<string, string>>(new Map());
  const [confirming, setConfirming] = useState<ProgramBulkAction | null>(null);
  const [scanFor, setScanFor] = useState<ProgramRow | null>(null);
  const q = useSettled(search.trim());
  const { cursor, canGoBack, depth, goNext, goBack, reset } = useCursorStack();
  const status: StatusFilter | null = pill === 'active' || pill === 'paused' ? pill : null;
  const list = usePrograms(
    {
      status,
      sort: 'name',
      q,
      hasInScopeRule: pill === 'no_scope' ? false : null,
      hasDomain: unmapped ? false : null,
      limit: LIMIT,
    },
    cursor,
  );
  const all = usePrograms({ limit: 1 });
  const active = usePrograms({ status: 'active', limit: 1 });
  const paused = usePrograms({ status: 'paused', limit: 1 });
  const noScope = usePrograms({ hasInScopeRule: false, limit: 1 });
  const domains = useDomains({ limit: 1 });
  const month = useDashboardSummary('30d');
  const bulk = useBulkProgramAction();
  const toolModules = useToolModules();
  const createJob = useCreateJob();
  const counts: Readonly<Record<Pill, Figure>> = {
    all: totalOf(all),
    active: totalOf(active),
    paused: totalOf(paused),
    no_scope: totalOf(noScope),
  };
  const columns = canManage ? 10 : 8;
  const rows = list.data?.items ?? [];
  const allChecked = rows.length > 0 && rows.every((p) => selected.has(p.id));

  const clear = () => setSelected(new Map());
  const filterChanged = () => {
    setExpanded(null);
    clear();
    reset();
  };
  const toggle = (program: ProgramRow) => {
    const next = new Map(selected);
    if (next.has(program.id)) next.delete(program.id);
    else next.set(program.id, program.name);
    setSelected(next);
  };
  const toggleAll = () => {
    const next = new Map(selected);
    for (const p of rows) {
      if (allChecked) next.delete(p.id);
      else next.set(p.id, p.name);
    }
    setSelected(next);
  };
  const runBulk = (action: ProgramBulkAction) =>
    bulk.mutate(
      { action, ids: [...selected.keys()] },
      {
        onSuccess: () => {
          clear();
          setConfirming(null);
        },
      },
    );
  const bulkActions: readonly ProgramBulkAction[] =
    role === 'superadmin'
      ? ['resume', 'pause', 'archive', 'delete']
      : ['resume', 'pause', 'archive'];

  return (
    <div className="flex w-full flex-col gap-space-lg">
      <div className="flex flex-col justify-between gap-space-md pb-space-xs md:flex-row md:items-end">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 font-caption text-caption text-fg-faint">
            <span>ReconOS</span>
            <span aria-hidden="true">/</span>
            <span>Operations</span>
            <span aria-hidden="true">/</span>
            <span className="font-body-code text-body-code text-primary">Manage</span>
          </div>
          <div className="flex flex-wrap items-center gap-space-sm">
            <h1 className="font-headline-lg text-headline-lg tracking-tight text-fg">
              Program Management
            </h1>
            <span className="rounded-sm border border-border-strong bg-surface-2 px-1.5 py-0.5 font-body-code text-caption text-primary">
              SEC_OPS // S11
            </span>
          </div>
          <p className="max-w-2xl text-body-default text-fg-muted">
            Pause, resume and archive programs, configure their scope and run batch operations.
          </p>
        </div>
        {canManage && (
          <div className="flex items-center gap-space-sm self-start md:self-auto">
            <button type="button" onClick={() => setCreating(true)} className={NEW_BUTTON}>
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                add_circle
              </span>
              New Program
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-space-md sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label="Programs Registered"
          icon="inventory_2"
          tone="primary"
          value={counts.all}
          unit="total"
          note={
            month.data?.programs_new === undefined
              ? null
              : `+${COUNT.format(month.data.programs_new)} this month`
          }
          noteIcon="arrow_upward"
        />
        <KpiTile
          label="Active Surveillance"
          icon="radar"
          tone="good"
          value={counts.active}
          unit="active"
          note={(() => {
            const share = percentOf(counts.active, counts.all);
            return share === null ? null : `${share} active coverage`;
          })()}
          noteIcon="fiber_manual_record"
        />
        <KpiTile
          label="Missing Scope"
          icon="warning"
          tone="warn"
          value={counts.no_scope}
          unit="programs"
          note="Needs an In-Scope rule"
          noteIcon="edit_notifications"
        />
        <KpiTile
          label="Mapped Targets"
          icon="dns"
          tone="info"
          value={totalOf(domains)}
          unit="domains"
          note="across all programs"
          noteIcon="hub"
        />
      </div>

      <div className="flex flex-col overflow-hidden rounded-sm bg-surface shadow-md">
        <div className="flex flex-col gap-space-md p-space-md xl:flex-row xl:items-center xl:justify-between">
          <div className="relative w-full xl:w-96">
            <span
              aria-hidden="true"
              className="material-symbols-outlined pointer-events-none absolute left-2.5 top-2 text-[18px] text-fg-faint"
            >
              search
            </span>
            <label htmlFor="manage-search" className="sr-only">
              Filter programs
            </label>
            <input
              id="manage-search"
              type="search"
              value={search}
              placeholder="Filter programs by name, platform or handle…"
              onChange={(e) => {
                setSearch(e.target.value);
                filterChanged();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setSearch('');
                  filterChanged();
                }
              }}
              className="h-9 w-full rounded-sm bg-surface-2 pl-8 pr-12 font-body-default text-body-default text-fg placeholder:text-fg-faint focus:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <kbd className="pointer-events-none absolute right-2 top-2 rounded-sm bg-surface-3 px-1 font-body-code text-[10px] text-fg-faint">
              ESC
            </kbd>
          </div>
          <div className="flex flex-wrap items-center gap-space-md">
            <div
              role="group"
              aria-label="Status"
              className="flex flex-wrap items-center rounded-sm bg-surface-2 p-0.5"
            >
              {PILLS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  aria-pressed={pill === p.value}
                  onClick={() => {
                    setPill(p.value);
                    filterChanged();
                  }}
                  className={PILL}
                >
                  {p.label}
                  {counts[p.value] != null && (
                    <span
                      className={`rounded-sm px-1 font-body-code text-[10px] ${PILL_COUNT[p.value]}`}
                    >
                      {COUNT.format(counts[p.value] ?? 0)}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <label className="flex cursor-pointer select-none items-center gap-2">
              <input
                type="checkbox"
                checked={unmapped}
                onChange={(e) => {
                  setUnmapped(e.target.checked);
                  filterChanged();
                }}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className="relative h-4 w-7 rounded-full bg-surface-3 transition-colors peer-checked:bg-primary-container peer-focus-visible:ring-2 peer-focus-visible:ring-ring"
              >
                <span
                  className={`absolute left-0.5 top-0.5 h-3 w-3 rounded-full transition-transform ${unmapped ? 'translate-x-3 bg-accent-ink' : 'bg-fg-muted'}`}
                />
              </span>
              <span className="whitespace-nowrap text-body-default text-fg-muted">
                Unmapped only
              </span>
            </label>
            {list.data !== undefined && (
              <span className="font-body-code text-[11px] text-fg-faint">
                {COUNT.format(list.data.total)} {list.data.total === 1 ? 'program' : 'programs'}{' '}
                registered
              </span>
            )}
          </div>
        </div>

        {canManage && selected.size > 0 && (
          <div
            role="region"
            aria-label="Bulk actions"
            className="flex flex-col justify-between gap-space-sm border-y border-border bg-accent-soft/40 px-space-md py-2 lg:flex-row lg:items-center"
          >
            <span className="flex min-w-0 items-center gap-2 text-body-default text-fg">
              <span className="font-semibold">
                {COUNT.format(selected.size)} {selected.size === 1 ? 'program' : 'programs'}{' '}
                selected
              </span>
              <span className="truncate font-body-code text-caption text-fg-faint">
                ({[...selected.values()].join(', ')})
              </span>
            </span>
            <span className="flex flex-wrap items-center gap-1">
              {bulkActions.map((action) => (
                <button
                  key={action}
                  type="button"
                  disabled={bulk.isPending}
                  onClick={() =>
                    action === 'delete' || action === 'archive'
                      ? setConfirming(action)
                      : runBulk(action)
                  }
                  className={`${BULK_BUTTON} ${BULK_TONE[action]}`}
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
                    {BULK_ICON[action]}
                  </span>
                  {BULK_LABEL[action]}
                </button>
              ))}
              <button
                type="button"
                onClick={clear}
                className={`${BULK_BUTTON} text-fg-faint hover:text-fg`}
              >
                Clear selection
              </button>
            </span>
            {bulk.isError && confirming === null && (
              <p role="alert" className="text-caption text-crit-strong">
                {errorText(bulk.error, 'Could not change the selected programs.')}
              </p>
            )}
          </div>
        )}

        {list.isPending && <p className={NOTE}>Loading programs…</p>}
        {list.isError && (
          <p role="alert" className={ALERT}>
            {errorText(list.error, 'Could not load the program list.')}
          </p>
        )}
        {list.data !== undefined && rows.length === 0 && (
          <p className={NOTE}>No programs match this filter.</p>
        )}
        {list.data !== undefined && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] border-collapse text-left">
              <thead className="h-8 bg-surface-2">
                <tr>
                  {canManage && (
                    <th className={`${TH} w-8`}>
                      <input
                        type="checkbox"
                        aria-label="Select every program on this page"
                        checked={allChecked}
                        onChange={toggleAll}
                        className="h-3.5 w-3.5 accent-primary"
                      />
                    </th>
                  )}
                  <th className={TH}>Program</th>
                  <th className={TH}>Platform</th>
                  <th className={TH}>Status</th>
                  <th className={TH_CENTER}>Scopes</th>
                  <th className={TH_NUM}>Domains</th>
                  <th className={TH_NUM}>URLs</th>
                  <th className={TH}>Last scanned</th>
                  {canManage && <th className={TH_NUM}>Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-2 font-body-default text-body-default text-fg">
                {rows.map((program) => {
                  const open = expanded === program.id;
                  const href = safeHref(program.platform_url);
                  const noRule = program.in_scope_rule_count === 0;
                  return (
                    <Fragment key={program.id}>
                      <tr
                        className={`group transition-colors hover:bg-surface-3 ${open ? 'bg-surface-3/80' : ''}`}
                      >
                        {canManage && (
                          <td className={TD}>
                            <input
                              type="checkbox"
                              aria-label={`Select ${program.name}`}
                              checked={selected.has(program.id)}
                              onChange={() => toggle(program)}
                              className="h-3.5 w-3.5 accent-primary"
                            />
                          </td>
                        )}
                        <td className={TD}>
                          <span className="flex items-center gap-space-xs">
                            <button
                              type="button"
                              aria-expanded={open}
                              aria-controls={`scope-${program.id}`}
                              aria-label={`Scope of ${program.name}`}
                              onClick={() => setExpanded(open ? null : program.id)}
                              className={`rounded-sm p-0.5 hover:text-fg focus:outline-none focus:ring-2 focus:ring-ring ${open ? 'text-primary' : 'text-fg-faint'}`}
                            >
                              <span
                                aria-hidden="true"
                                className={`material-symbols-outlined text-[16px] transition-transform ${open ? 'rotate-90' : ''}`}
                              >
                                chevron_right
                              </span>
                            </button>
                            <Link
                              href={`/programs/${program.id}`}
                              className={`font-body-code-bold text-body-code-bold hover:text-primary hover:underline ${open ? 'text-primary' : 'text-fg'}`}
                            >
                              {program.name}
                            </Link>
                            {href !== null && (
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`Open ${program.name} on its platform`}
                                className="flex text-fg-faint hover:text-primary"
                              >
                                <span
                                  aria-hidden="true"
                                  className="material-symbols-outlined text-[14px]"
                                >
                                  open_in_new
                                </span>
                              </a>
                            )}
                            {/* N33: the chip is the bounty type. */}
                            <span className="rounded-sm border border-border-strong px-1 font-body-code text-[10px] uppercase text-fg-faint">
                              {program.bounty_type}
                            </span>
                          </span>
                        </td>
                        <td className={TD}>
                          {program.platform === null ? (
                            <span className="text-fg-faint">-</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-accent-soft px-2 py-0.5 font-body-code text-[11px] font-semibold text-primary">
                              <span
                                aria-hidden="true"
                                className="h-1.5 w-1.5 rounded-full bg-primary"
                              />
                              {program.platform}
                            </span>
                          )}
                        </td>
                        <td className={TD}>
                          <span className="flex items-center gap-space-xs whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 font-body-code text-[11px] ${STATUS_CHIP[program.status]}`}
                            >
                              <span
                                aria-hidden="true"
                                className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[program.status]}`}
                              />
                              {PROGRAM_STATUS_LABEL[program.status]}
                            </span>
                            <ProgramActions
                              program={program}
                              role={role}
                              parts={['toggle']}
                              compact
                            />
                          </span>
                        </td>
                        <td className={`${TD} text-center`}>
                          {noRule ? (
                            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-sm bg-warn-soft px-2 py-0.5 font-body-code text-[11px] text-warn">
                              <span
                                aria-hidden="true"
                                className="material-symbols-outlined text-[12px]"
                              >
                                error
                              </span>
                              None
                            </span>
                          ) : (
                            <span className="whitespace-nowrap rounded-sm bg-surface-2 px-2 py-0.5 font-body-code text-[11px] text-fg">
                              {COUNT.format(program.in_scope_rule_count)} in ·{' '}
                              {COUNT.format(program.out_of_scope_rule_count)} out
                            </span>
                          )}
                        </td>
                        <td className={`${TD_NUM} text-fg`}>
                          {COUNT.format(program.domain_count)}
                        </td>
                        <td className={`${TD_NUM} text-fg-muted`}>
                          {COUNT.format(program.url_count)}
                        </td>
                        <td
                          className={`${TD} whitespace-nowrap font-body-code text-[11px] text-fg-faint`}
                        >
                          {program.last_job_finished_at == null
                            ? 'Never'
                            : formatMoment(program.last_job_finished_at)}
                        </td>
                        {canManage && (
                          <td className={`${TD} text-right`}>
                            <span className="inline-flex items-center justify-end gap-1 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => setExpanded(program.id)}
                                aria-label={`Add scope to ${program.name}`}
                                className={noRule ? SCOPE_BUTTON_WARN : SCOPE_BUTTON}
                              >
                                {noRule ? '+ Add Scope' : '+ Scope'}
                              </button>
                              {!noRule && program.status === 'active' && (
                                <button
                                  type="button"
                                  onClick={() => setScanFor(program)}
                                  aria-label={`Run Scan on ${program.name}`}
                                  className={SCOPE_BUTTON}
                                >
                                  + Target
                                </button>
                              )}
                              <ProgramActions
                                program={program}
                                role={role}
                                parts={['delete']}
                                onGone={() => setExpanded(null)}
                                compact
                              />
                            </span>
                          </td>
                        )}
                      </tr>
                      {open && (
                        <tr id={`scope-${program.id}`}>
                          <td colSpan={columns} className="bg-surface-container-low p-space-md">
                            <ScopePreview program={program} canManage={canManage} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {list.data !== undefined && (
          <div className="flex items-center gap-space-sm border-t border-border bg-surface-2 px-space-md">
            {/* M29: measured in the browser around the list request. */}
            <span className="hidden whitespace-nowrap font-body-code text-[10px] text-fg-faint sm:inline">
              Latency: {COUNT.format(list.data.latency_ms)}ms
            </span>
            <div className="order-first flex-1">
              <Pagination
                label="Program list pagination"
                page={{
                  total: list.data.total,
                  totalIsEstimate: list.data.total_is_estimate,
                  nextCursor: list.data.next_cursor,
                }}
                shown={rows.length}
                start={depth * LIMIT + 1}
                noun="programs"
                canGoBack={canGoBack}
                onBack={() => {
                  goBack();
                  setExpanded(null);
                }}
                onNext={() => {
                  goNext(list.data.next_cursor);
                  setExpanded(null);
                }}
              />
            </div>
          </div>
        )}
      </div>

      {confirming !== null && (
        <ConfirmDialog
          title={confirming === 'delete' ? 'Delete programs' : 'Archive programs'}
          message={
            confirming === 'delete'
              ? `Delete ${COUNT.format(selected.size)} programs and everything they hold? This cannot be undone.`
              : `Archive ${COUNT.format(selected.size)} programs? Archived programs leave this list and take no new jobs.`
          }
          confirmLabel={confirming === 'delete' ? 'Delete' : 'Archive'}
          busy={bulk.isPending}
          error={
            bulk.isError ? errorText(bulk.error, 'Could not change the selected programs.') : null
          }
          onConfirm={() => runBulk(confirming)}
          onClose={() => {
            setConfirming(null);
            bulk.reset();
          }}
        />
      )}
      {creating && <ProgramForm onDone={() => setCreating(false)} />}
      <RunScanDialog
        open={scanFor !== null}
        programName={scanFor?.name ?? ''}
        targets={[]}
        editableTargets
        toolModules={toolModules.data?.items ?? []}
        pending={createJob.isPending}
        error={createJob.error}
        onClose={() => {
          setScanFor(null);
          createJob.reset();
        }}
        onSubmit={(request) => {
          if (scanFor === null) return;
          createJob.mutate(
            {
              program_id: scanFor.id,
              tool_module_id: request.toolModuleId,
              target: request.target,
              priority: request.priority,
              params: request.params,
            },
            { onSuccess: () => setScanFor(null) },
          );
        }}
      />
    </div>
  );
}
