'use client';

import Link from 'next/link';
import { Fragment, type ReactElement, useState } from 'react';

import { Pagination, useCursorStack } from '@/components/pagination';
import { useMe } from '@/lib/auth';
import { useDomains } from '@/lib/domains';
import { formatMoment } from '@/lib/format-moment';
import { type ProgramFilter, type ProgramStatus, usePrograms } from '@/lib/programs';

import { ScopePanel } from '../programs/[programId]/scope-panel';
import { errorText } from '../programs/error-text';
import { ProgramActions } from '../programs/program-actions';
import { ProgramForm } from '../programs/program-form';
import { type Figure, totalOf } from '../programs/stat-tile';
import { PROGRAM_STATUS_LABEL } from '../programs/status-badge';
import { ALERT, COUNT, NOTE } from '../programs/ui';

type StatusFilter = NonNullable<ProgramFilter['status']>;

const PILLS: readonly { value: StatusFilter | null; label: string }[] = [
  { value: null, label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
];

// Class strings follow the S11 mockup (M7): a segmented status control, a compact table
// with right-aligned mono figures, chips for platform, status and scope counts.
const PILL =
  'flex items-center gap-1.5 rounded-sm px-2.5 py-1 font-panel-title text-panel-title text-fg-muted hover:bg-surface-3/50 hover:text-fg aria-pressed:bg-surface-3 aria-pressed:font-semibold aria-pressed:text-primary focus:outline-none focus:ring-2 focus:ring-ring';

const NEW_BUTTON =
  'flex items-center gap-1.5 rounded-sm bg-primary-container px-3 py-1.5 font-panel-title text-panel-title font-semibold text-accent-ink shadow-sm hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-ring';

const SCOPE_BUTTON =
  'rounded-sm bg-surface-2 px-2 py-0.5 font-body-code text-[11px] text-fg-muted hover:bg-surface-bright hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring';

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

type TileTone = 'primary' | 'good' | 'info';

const TILE_BORDER: Readonly<Record<TileTone, string>> = {
  primary: 'border-primary-container',
  good: 'border-good',
  info: 'border-info',
};
const TILE_ICON: Readonly<Record<TileTone, string>> = {
  primary: 'text-primary',
  good: 'text-good',
  info: 'text-info',
};
const TILE_VALUE: Readonly<Record<TileTone, string>> = {
  primary: 'text-fg',
  good: 'text-good',
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
}: {
  label: string;
  icon: string;
  tone: TileTone;
  value: Figure;
  unit: string;
  note: string;
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
      <p className="mt-1 font-caption text-caption text-fg-faint">{note}</p>
    </div>
  );
}

/** S11: programs as a table, to pause, resume, archive and edit scope in place. */
export default function ManagePage(): ReactElement {
  const me = useMe();
  const role = me.data?.role ?? null;
  const canManage = role === 'superadmin' || role === 'admin';
  const [status, setStatus] = useState<StatusFilter | null>(null);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { cursor, canGoBack, goNext, goBack, reset } = useCursorStack();
  const list = usePrograms({ status, sort: 'name' }, cursor);
  const all = usePrograms({ limit: 1 });
  const active = usePrograms({ status: 'active', limit: 1 });
  const domains = useDomains({ limit: 1 });
  const columns = canManage ? 8 : 7;

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
          <h1 className="font-headline-lg text-headline-lg tracking-tight text-fg">
            Program Management
          </h1>
          <p className="max-w-2xl text-body-default text-fg-muted">
            Pause, resume and archive programs, and edit their scope.
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

      <div className="grid grid-cols-1 gap-space-md sm:grid-cols-3">
        <KpiTile
          label="Programs"
          icon="inventory_2"
          tone="primary"
          value={totalOf(all)}
          unit="total"
          note="Every status"
        />
        <KpiTile
          label="Active"
          icon="radar"
          tone="good"
          value={totalOf(active)}
          unit="active"
          note="Not paused or archived"
        />
        <KpiTile
          label="Domains"
          icon="dns"
          tone="info"
          value={totalOf(domains)}
          unit="domains"
          note="Across all programs"
        />
      </div>

      <div className="flex flex-col overflow-hidden rounded-sm bg-surface shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-space-md p-space-md">
          <div
            role="group"
            aria-label="Status"
            className="flex flex-wrap items-center rounded-sm bg-surface-2 p-0.5"
          >
            {PILLS.map((pill) => (
              <button
                key={pill.label}
                type="button"
                aria-pressed={status === pill.value}
                onClick={() => {
                  setStatus(pill.value);
                  setExpanded(null);
                  reset();
                }}
                className={PILL}
              >
                {pill.label}
              </button>
            ))}
          </div>
          {list.data !== undefined && (
            <span className="font-body-code text-[11px] text-fg-faint">
              {COUNT.format(list.data.total)} {list.data.total === 1 ? 'program' : 'programs'}
            </span>
          )}
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse text-left">
              <thead className="h-8 bg-surface-2">
                <tr>
                  <th className={TH}>Program</th>
                  <th className={TH}>Platform</th>
                  <th className={TH}>Status</th>
                  <th className={TH_CENTER}>Scopes</th>
                  <th className={TH_NUM}>Domains</th>
                  <th className={TH_NUM}>URLs</th>
                  <th className={TH}>Updated</th>
                  {canManage && <th className={TH_NUM}>Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-2 font-body-default text-body-default text-fg">
                {list.data.items.map((program) => {
                  const open = expanded === program.id;
                  return (
                    <Fragment key={program.id}>
                      <tr
                        className={`group transition-colors hover:bg-surface-3 ${open ? 'bg-surface-3/80' : ''}`}
                      >
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
                          <span className="flex flex-wrap items-center gap-space-xs">
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
                          <span className="whitespace-nowrap rounded-sm bg-surface-2 px-2 py-0.5 font-body-code text-[11px] text-fg">
                            {COUNT.format(program.in_scope_rule_count)} in ·{' '}
                            {COUNT.format(program.out_of_scope_rule_count)} out
                          </span>
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
                          {formatMoment(program.updated_at)}
                        </td>
                        {canManage && (
                          <td className={`${TD} text-right`}>
                            <span className="inline-flex flex-wrap items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => setExpanded(program.id)}
                                aria-label={`Add scope to ${program.name}`}
                                className={SCOPE_BUTTON}
                              >
                                + Scope
                              </button>
                              <ProgramActions
                                program={program}
                                role={role}
                                parts={['archive', 'delete']}
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
                            <ScopePanel programId={program.id} canManage={canManage} />
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
          <div className="border-t border-border bg-surface-2 px-space-md">
            <Pagination
              label="Program list pagination"
              page={{
                total: list.data.total,
                totalIsEstimate: list.data.total_is_estimate,
                nextCursor: list.data.next_cursor,
              }}
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
        )}
      </div>

      {creating && <ProgramForm onDone={() => setCreating(false)} />}
    </div>
  );
}
