'use client';

import { type ReactElement, useState } from 'react';

import { Pagination, useCursorStack } from '@/components/pagination';
import { useMe } from '@/lib/auth';
import { useDomains } from '@/lib/domains';
import { useFindings } from '@/lib/findings';
import { type ProgramFilter, usePrograms } from '@/lib/programs';

import { errorText } from './error-text';
import { ProgramCard } from './program-card';
import { ProgramForm } from './program-form';
import { StatTile, totalOf } from './stat-tile';
import { ALERT, FIELD, NOTE, PANEL, PRIMARY_BUTTON } from './ui';

type StatusFilter = NonNullable<ProgramFilter['status']>;

const PILLS: readonly { value: StatusFilter | null; label: string }[] = [
  { value: null, label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
];

const SORTS: readonly { value: string; label: string }[] = [
  { value: 'name', label: 'Name (A-Z)' },
  { value: '-created_at', label: 'Newest first' },
];

const PILL =
  'rounded-sm px-space-md py-space-xs text-body-default text-fg-muted hover:text-fg aria-pressed:bg-surface-3 aria-pressed:text-fg focus:outline-none focus:ring-2 focus:ring-ring';

/** S08: every program the reader may see, as cards. */
export default function ProgramsPage(): ReactElement {
  const me = useMe();
  const canManage = me.data?.role === 'superadmin' || me.data?.role === 'admin';
  const [status, setStatus] = useState<StatusFilter | null>(null);
  const [sort, setSort] = useState('name');
  const [creating, setCreating] = useState(false);
  const { cursor, canGoBack, goNext, goBack, reset } = useCursorStack();
  const list = usePrograms({ status, sort }, cursor);
  const allPrograms = usePrograms({ limit: 1 });
  const domains = useDomains({ limit: 1 });
  const findings = useFindings({ limit: 1 });

  return (
    <div className="flex w-full flex-col gap-space-lg">
      <div className="flex flex-col justify-between gap-space-md pt-space-xs md:flex-row md:items-end">
        <div className="flex flex-col gap-space-xs">
          <h1 className="text-headline-lg text-fg">Programs</h1>
          <p className="max-w-2xl text-body-default text-fg-muted">
            Bug bounty programs and their authorized testing scope.
          </p>
        </div>
        {canManage && (
          <div className="flex items-center gap-space-sm self-start md:self-auto">
            <button type="button" onClick={() => setCreating(true)} className={PRIMARY_BUTTON}>
              <span aria-hidden="true" className="material-symbols-outlined text-icon">
                add
              </span>
              New Program
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-space-md sm:grid-cols-3">
        <StatTile
          label="Programs"
          icon="folder_special"
          tone="primary"
          value={totalOf(allPrograms)}
        />
        <StatTile label="Domains" icon="language" tone="domain" value={totalOf(domains)} />
        <StatTile label="Findings" icon="bug_report" tone="crit" value={totalOf(findings)} />
      </div>

      <div
        className={`${PANEL} flex flex-col gap-space-md p-space-md md:flex-row md:items-center md:justify-between`}
      >
        <div role="group" aria-label="Status" className="flex flex-wrap items-center gap-space-xs">
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
            </button>
          ))}
        </div>
        <div className="flex items-center gap-space-sm">
          <label htmlFor="programs-sort" className="text-caption text-fg-faint">
            Sort by:
          </label>
          <select
            id="programs-sort"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              reset();
            }}
            className={`${FIELD} h-9 w-auto`}
          >
            {SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
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
        <Pagination
          label="Program list pagination"
          page={{
            total: list.data.total,
            totalIsEstimate: list.data.total_is_estimate,
            nextCursor: list.data.next_cursor,
          }}
          canGoBack={canGoBack}
          onBack={goBack}
          onNext={() => goNext(list.data.next_cursor)}
        />
      )}

      {creating && <ProgramForm onDone={() => setCreating(false)} />}
    </div>
  );
}
