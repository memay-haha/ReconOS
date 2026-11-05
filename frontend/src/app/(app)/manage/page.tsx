'use client';

import Link from 'next/link';
import { Fragment, type ReactElement, useState } from 'react';

import { Pagination, useCursorStack } from '@/components/pagination';
import { useMe } from '@/lib/auth';
import { useDomains } from '@/lib/domains';
import { formatMoment } from '@/lib/format-moment';
import { type ProgramFilter, usePrograms } from '@/lib/programs';

import { ScopePanel } from '../programs/[programId]/scope-panel';
import { errorText } from '../programs/error-text';
import { ProgramActions } from '../programs/program-actions';
import { ProgramForm } from '../programs/program-form';
import { StatTile, totalOf } from '../programs/stat-tile';
import { ProgramStatusBadge } from '../programs/status-badge';
import { ALERT, COUNT, NOTE, PANEL, PRIMARY_BUTTON, ROW_BUTTON, TD, TH } from '../programs/ui';

type StatusFilter = NonNullable<ProgramFilter['status']>;

const PILLS: readonly { value: StatusFilter | null; label: string }[] = [
  { value: null, label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
];

const PILL =
  'rounded-sm px-space-md py-space-xs text-body-default text-fg-muted hover:text-fg aria-pressed:bg-surface-3 aria-pressed:text-fg focus:outline-none focus:ring-2 focus:ring-ring';

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
      <div className="flex flex-col justify-between gap-space-md pt-space-xs md:flex-row md:items-end">
        <div className="flex flex-col gap-space-xs">
          <div className="flex items-center gap-space-sm text-caption text-fg-faint">
            <span>ReconOS</span>
            <span aria-hidden="true">/</span>
            <span>Operations</span>
            <span aria-hidden="true">/</span>
            <span className="text-body-code text-primary">Manage</span>
          </div>
          <h1 className="text-headline-lg text-fg">Program Management</h1>
          <p className="max-w-2xl text-body-default text-fg-muted">
            Pause, resume and archive programs, and edit their scope.
          </p>
        </div>
        {canManage && (
          <div className="flex items-center gap-space-sm self-start md:self-auto">
            <button type="button" onClick={() => setCreating(true)} className={PRIMARY_BUTTON}>
              <span aria-hidden="true" className="material-symbols-outlined text-icon">
                add_circle
              </span>
              New Program
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-space-md sm:grid-cols-3">
        <StatTile label="Programs" icon="inventory_2" tone="primary" value={totalOf(all)} />
        <StatTile label="Active" icon="radar" tone="good" value={totalOf(active)} />
        <StatTile label="Domains" icon="dns" tone="domain" value={totalOf(domains)} />
      </div>

      <div className={`${PANEL} flex flex-col`}>
        <div className="flex flex-wrap items-center justify-between gap-space-md border-b border-border p-space-md">
          <div
            role="group"
            aria-label="Status"
            className="flex flex-wrap items-center gap-space-xs"
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
            <table className="w-full min-w-[880px] border-collapse">
              <thead className="border-b border-border bg-surface-2">
                <tr>
                  <th className={TH}>Program</th>
                  <th className={TH}>Platform</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>Scopes</th>
                  <th className={TH}>Domains</th>
                  <th className={TH}>URLs</th>
                  <th className={TH}>Updated</th>
                  {canManage && <th className={TH}>Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list.data.items.map((program) => {
                  const open = expanded === program.id;
                  return (
                    <Fragment key={program.id}>
                      <tr>
                        <td className={TD}>
                          <span className="flex items-center gap-space-xs">
                            <button
                              type="button"
                              aria-expanded={open}
                              aria-controls={`scope-${program.id}`}
                              aria-label={`Scope of ${program.name}`}
                              onClick={() => setExpanded(open ? null : program.id)}
                              className="rounded-sm p-0.5 text-fg-muted hover:text-fg focus:outline-none focus:ring-2 focus:ring-ring"
                            >
                              <span
                                aria-hidden="true"
                                className={`material-symbols-outlined text-icon ${open ? 'rotate-90' : ''}`}
                              >
                                chevron_right
                              </span>
                            </button>
                            <Link
                              href={`/programs/${program.id}`}
                              className="font-body-code-bold text-body-code-bold text-fg hover:text-primary"
                            >
                              {program.name}
                            </Link>
                          </span>
                        </td>
                        <td className={TD}>{program.platform ?? '-'}</td>
                        <td className={TD}>
                          <span className="flex flex-wrap items-center gap-space-xs">
                            <ProgramStatusBadge status={program.status} />
                            <ProgramActions program={program} role={role} parts={['toggle']} />
                          </span>
                        </td>
                        <td className={`${TD} font-body-code`}>
                          {COUNT.format(program.in_scope_rule_count)} in ·{' '}
                          {COUNT.format(program.out_of_scope_rule_count)} out
                        </td>
                        <td className={`${TD} font-body-code`}>
                          {COUNT.format(program.domain_count)}
                        </td>
                        <td className={`${TD} font-body-code`}>
                          {COUNT.format(program.url_count)}
                        </td>
                        <td className={TD}>{formatMoment(program.updated_at)}</td>
                        {canManage && (
                          <td className={TD}>
                            <span className="flex flex-wrap items-center gap-space-xs">
                              <button
                                type="button"
                                onClick={() => setExpanded(program.id)}
                                aria-label={`Add scope to ${program.name}`}
                                className={ROW_BUTTON}
                              >
                                + Scope
                              </button>
                              <ProgramActions
                                program={program}
                                role={role}
                                parts={['archive', 'delete']}
                                onGone={() => setExpanded(null)}
                              />
                            </span>
                          </td>
                        )}
                      </tr>
                      {open && (
                        <tr id={`scope-${program.id}`}>
                          <td colSpan={columns} className="bg-surface-2 p-space-md">
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
