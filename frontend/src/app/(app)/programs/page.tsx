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
import { ALERT, NOTE } from './ui';

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
  'rounded-sm px-3 py-1 font-label-caps text-label-caps text-fg-muted transition-colors hover:text-fg aria-pressed:bg-surface-3 aria-pressed:text-primary focus:outline-none focus:ring-2 focus:ring-ring';

const NEW_BUTTON =
  'inline-flex h-9 items-center gap-1.5 rounded-sm bg-primary-container px-3.5 font-label-caps text-label-caps font-semibold uppercase text-accent-ink shadow-sm transition-colors hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-ring';

const SORT_FIELD =
  'h-8 cursor-pointer rounded-sm bg-surface-2 pl-2.5 pr-2 text-body-default text-fg transition-colors hover:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-ring';

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

      <div className="flex flex-col justify-between gap-space-md rounded-sm bg-surface p-3 shadow-sm md:flex-row md:items-center">
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
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="programs-sort" className="whitespace-nowrap text-caption text-fg-faint">
            Sort by:
          </label>
          <select
            id="programs-sort"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
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
