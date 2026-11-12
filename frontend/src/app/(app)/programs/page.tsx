'use client';

import { type ReactElement, useState } from 'react';

import { Pagination, useCursorStack } from '@/components/pagination';
import { useMe } from '@/lib/auth';
import { type DashboardSummary, useDashboardSummary } from '@/lib/dashboard';
import { useDomains } from '@/lib/domains';
import { type ProgramFilter, type ProgramSort, SEVERITIES, usePrograms } from '@/lib/programs';

import { errorText } from './error-text';
import { ProgramCard } from './program-card';
import { ProgramForm } from './program-form';
import { type Figure, percentOf, StatTile, totalOf } from './stat-tile';
import { ALERT, COUNT, NOTE } from './ui';
import { useSettled } from './use-settled';

type StatusFilter = NonNullable<ProgramFilter['status']>;

const PILLS: readonly { value: StatusFilter | null; label: string }[] = [
  { value: null, label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
];

/** The mockup's sort list; "Recently synced" became "Recently scanned" (N23, M22). */
const SORTS: readonly { value: ProgramSort; label: string }[] = [
  { value: '-domain_count', label: 'Most domains' },
  { value: '-finding_critical_count', label: 'Most critical findings' },
  { value: '-last_job_finished_at', label: 'Recently scanned' },
  { value: 'name', label: 'Name (A-Z)' },
];

/** Six cards a page, the mockup's grid of two rows. */
const PAGE_SIZE = 6;

const PILL =
  'flex items-center gap-1 rounded-sm px-3 py-1 font-label-caps text-label-caps text-fg-muted transition-colors hover:text-fg aria-pressed:bg-surface-3 aria-pressed:text-primary focus:outline-none focus:ring-2 focus:ring-ring';

const NEW_BUTTON =
  'inline-flex h-9 items-center gap-1.5 rounded-sm bg-primary-container px-3.5 font-label-caps text-label-caps font-semibold uppercase text-accent-ink shadow-sm transition-colors hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-ring';

const SORT_FIELD =
  'h-8 cursor-pointer rounded-sm bg-surface-2 pl-2.5 pr-2 text-body-default text-fg transition-colors hover:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-ring';

const SEARCH_FIELD =
  'h-9 w-full rounded-sm bg-surface-2 pl-8 pr-3 font-body-code text-body-code text-fg placeholder:text-fg-faint transition-colors focus:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-ring';

/** `findings_near_sla` joined `GET /dashboard/summary` with M21; read it without assuming
 * the shared type has caught up. */
// Partial: a field the backend has not shipped yet must leave its tile empty, not crash it.
type SummaryWithSla = Partial<DashboardSummary> & { readonly findings_near_sla?: number };

/** "100% active sync" (P3): the 24-hour share of `active` programs, whatever the window.
 * Absent (old backend) hides the figure; null (no `active` program yet) shows a dash. */
function activeSync(summary: SummaryWithSla | undefined): string | null {
  const ratio = summary?.active_sync_ratio;
  if (ratio === undefined) return null;
  return `${ratio === null ? '–' : `${Math.round(ratio * 100)}%`} active sync`;
}

function openFindings(summary: SummaryWithSla | undefined): Figure {
  if (summary === undefined) return undefined;
  const bySeverity = summary.findings_by_severity;
  if (bySeverity === undefined) return null;
  return SEVERITIES.reduce((sum, s) => sum + bySeverity[s], 0);
}

/** S08: every program the reader may see, as cards. */
export default function ProgramsPage(): ReactElement {
  const me = useMe();
  const canManage = me.data?.role === 'superadmin' || me.data?.role === 'admin';
  const [status, setStatus] = useState<StatusFilter | null>(null);
  const [sort, setSort] = useState<ProgramSort>('-domain_count');
  const [search, setSearch] = useState('');
  // N22: on by default, every program shows; off hides programs without an In-Scope rule.
  const [showEmpty, setShowEmpty] = useState(true);
  const [creating, setCreating] = useState(false);
  const q = useSettled(search.trim());
  const { cursor, canGoBack, depth, goNext, goBack, reset } = useCursorStack();
  const list = usePrograms(
    { status, sort, q, hasInScopeRule: showEmpty ? null : true, limit: PAGE_SIZE },
    cursor,
  );
  const all = usePrograms({ limit: 1 });
  const active = usePrograms({ status: 'active', limit: 1 });
  const paused = usePrograms({ status: 'paused', limit: 1 });
  const domains = useDomains({ limit: 1 });
  const resolved = useDomains({ dnsStatus: 'resolved', limit: 1 });
  const month = useDashboardSummary('30d');
  const day = useDashboardSummary('24h');
  const daySummary: SummaryWithSla | undefined = day.data;
  const monthSummary: SummaryWithSla | undefined = month.data;

  const counts: Readonly<Record<string, Figure>> = {
    All: totalOf(all),
    Active: totalOf(active),
    Paused: totalOf(paused),
  };
  const programTotal = totalOf(all);
  const activeTotal = totalOf(active);
  const domainTotal = totalOf(domains);
  const coverage = percentOf(activeTotal, programTotal);
  const resolvedShare = percentOf(totalOf(resolved), domainTotal);
  const findingTotal = openFindings(daySummary);
  const nearSla = daySummary?.findings_near_sla;

  return (
    <div className="flex w-full flex-col gap-space-lg">
      <div className="flex flex-col justify-between gap-space-md sm:flex-row sm:items-center">
        <div className="flex flex-col">
          <h1 className="text-headline-lg tracking-tight text-fg">Programs</h1>
          <p className="mt-0.5 max-w-2xl text-body-default text-fg-muted">
            Bug bounty programs and their authorized testing scope.
          </p>
        </div>
        {canManage && (
          <div className="flex items-center gap-space-sm self-start md:self-auto">
            <button type="button" onClick={() => setCreating(true)} className={NEW_BUTTON}>
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                add
              </span>
              New Program
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-space-md sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Total Programs"
          icon="folder_special"
          tone="primary"
          value={programTotal}
          trend={
            monthSummary?.programs_new === undefined
              ? null
              : `+${COUNT.format(monthSummary.programs_new)} this month`
          }
          trendIcon="trending_up"
          trendTone="primary"
          footer="Registered programs"
          footerValue={activeSync(daySummary)}
        />
        <StatTile
          label="Active In Scope"
          icon="verified"
          tone="good"
          value={activeTotal}
          trend={coverage === null ? null : `${coverage} coverage`}
          footer="Continuous monitoring"
          footerValue={counts.Paused == null ? null : `${COUNT.format(counts.Paused)} paused`}
          footerTone="primary"
        />
        <StatTile
          label="Total Monitored Domains"
          icon="language"
          tone="domain"
          value={domainTotal}
          trend={
            daySummary?.assets_new === undefined
              ? null
              : `+${COUNT.format(daySummary.assets_new.domain)} 24h`
          }
          trendIcon="arrow_upward"
          footer="Monitored domains"
          footerValue={resolvedShare === null ? null : `${resolvedShare} resolved`}
        />
        <StatTile
          label="Total Findings"
          icon="bug_report"
          tone="crit"
          value={findingTotal}
          trend={
            daySummary?.findings_by_severity === undefined
              ? null
              : `${COUNT.format(daySummary.findings_by_severity.critical)} critical`
          }
          trendTone="crit"
          footer="Remediation SLA"
          footerValue={nearSla === undefined ? null : `${COUNT.format(nearSla)} near breach`}
          footerTone="warn"
        />
      </div>

      <div className="flex flex-col gap-space-md rounded-sm bg-surface p-3 shadow-sm xl:flex-row xl:items-center">
        <div className="relative w-full xl:w-80 xl:shrink-0">
          <span
            aria-hidden="true"
            className="material-symbols-outlined pointer-events-none absolute left-2.5 top-2 text-[18px] text-fg-faint"
          >
            search
          </span>
          <label htmlFor="programs-search" className="sr-only">
            Search programs
          </label>
          <input
            id="programs-search"
            type="search"
            value={search}
            placeholder="Search programs by name, platform or handle..."
            onChange={(e) => {
              setSearch(e.target.value);
              // A new search makes every collected cursor stale.
              reset();
            }}
            className={SEARCH_FIELD}
          />
        </div>
        <div className="flex flex-wrap items-center gap-space-md xl:flex-nowrap">
          <div
            role="group"
            aria-label="Status"
            className="flex w-fit items-center rounded-sm bg-surface-2 p-0.5"
          >
            {PILLS.map((pill) => (
              <button
                key={pill.label}
                type="button"
                aria-pressed={status === pill.value}
                onClick={() => {
                  setStatus(pill.value);
                  reset();
                }}
                className={PILL}
              >
                {pill.label}
                {counts[pill.label] != null && (
                  <span className="font-body-code">({COUNT.format(counts[pill.label] ?? 0)})</span>
                )}
              </button>
            ))}
          </div>
          <label className="flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1 hover:bg-surface-2">
            <input
              type="checkbox"
              checked={showEmpty}
              onChange={(e) => {
                setShowEmpty(e.target.checked);
                reset();
              }}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className="relative h-4 w-8 rounded-full bg-surface-3 transition-colors peer-checked:bg-primary-container peer-focus-visible:ring-2 peer-focus-visible:ring-ring"
            >
              <span
                className={`absolute left-0.5 top-0.5 h-3 w-3 rounded-full transition-transform ${showEmpty ? 'translate-x-4 bg-accent-ink' : 'bg-fg-muted'}`}
              />
            </span>
            <span className="whitespace-nowrap text-caption text-fg-muted">Show empty scope</span>
          </label>
        </div>
        <div className="flex items-center gap-space-md xl:ml-auto">
          <div className="flex items-center gap-2">
            <label htmlFor="programs-sort" className="whitespace-nowrap text-caption text-fg-faint">
              Sort by:
            </label>
            <select
              id="programs-sort"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as ProgramSort);
                reset();
              }}
              className={SORT_FIELD}
            >
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {list.data !== undefined && (
            <span className="whitespace-nowrap font-body-code text-caption text-fg-faint">
              Showing {COUNT.format(list.data.total)}{' '}
              {list.data.total === 1 ? 'program' : 'programs'}
            </span>
          )}
        </div>
      </div>

      {list.isPending && <p className={NOTE}>Loading programs…</p>}
      {list.isError && (
        <p role="alert" className={ALERT}>
          {errorText(list.error, 'Could not load the program list.')}
        </p>
      )}
      {list.data !== undefined && list.data.items.length === 0 && (
        <p className={NOTE}>No programs match this filter.</p>
      )}
      {list.data !== undefined && list.data.items.length > 0 && (
        <div className="grid grid-cols-1 gap-space-md md:grid-cols-2 lg:grid-cols-3">
          {list.data.items.map((program) => (
            <ProgramCard key={program.id} program={program} />
          ))}
        </div>
      )}
      {list.data !== undefined && (
        <div className="rounded-sm bg-surface px-3 shadow-sm">
          <Pagination
            label="Program list pagination"
            page={{
              total: list.data.total,
              totalIsEstimate: list.data.total_is_estimate,
              nextCursor: list.data.next_cursor,
            }}
            shown={list.data.items.length}
            start={depth * PAGE_SIZE + 1}
            noun="programs"
            canGoBack={canGoBack}
            onBack={goBack}
            onNext={() => goNext(list.data.next_cursor)}
          />
        </div>
      )}

      {creating && <ProgramForm onDone={() => setCreating(false)} />}
    </div>
  );
}
