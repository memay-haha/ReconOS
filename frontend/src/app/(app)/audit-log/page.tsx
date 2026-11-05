'use client';

import { type FormEvent, type ReactElement, useState } from 'react';

import { Pagination, useCursorStack } from '@/components/pagination';
import { type AuditLogFilter, useAuditLogs } from '@/lib/audit-logs';

import { AuditTable } from './audit-table';

const NO_FILTER: AuditLogFilter = {
  userId: null,
  action: null,
  createdFrom: null,
  createdTo: null,
};

// Header, filter bar and table follow S12's look, the screen this log was split from.
const FIELD =
  'h-8 rounded-sm border border-border-strong bg-surface-2 px-2.5 font-body-code text-body-code text-fg focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring';
const FIELD_LABEL = 'flex flex-col gap-1 font-label-caps text-label-caps uppercase text-fg-faint';

/** A calendar day in Vietnam, the zone every date on screen is shown in, as an instant. */
function dayBoundary(day: string, end: boolean): string | null {
  if (day === '') return null;
  const instant = new Date(`${day}T${end ? '23:59:59.999' : '00:00:00.000'}+07:00`);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}

export default function AuditLogPage(): ReactElement {
  const [draftAction, setDraftAction] = useState('');
  const [draftFrom, setDraftFrom] = useState('');
  const [draftTo, setDraftTo] = useState('');
  const [rangeError, setRangeError] = useState(false);
  const [filter, setFilter] = useState<AuditLogFilter>(NO_FILTER);
  const { cursor, canGoBack, goNext, goBack, reset } = useCursorStack();
  const logs = useAuditLogs(filter, cursor);

  const onFilter = (event: FormEvent) => {
    event.preventDefault();
    if (draftFrom !== '' && draftTo !== '' && draftFrom > draftTo) {
      setRangeError(true);
      return;
    }
    setRangeError(false);
    const trimmed = draftAction.trim();
    setFilter({
      userId: null,
      action: trimmed === '' ? null : trimmed,
      createdFrom: dayBoundary(draftFrom, false),
      createdTo: dayBoundary(draftTo, true),
    });
    // Every cursor collected so far points into the previous result set.
    reset();
  };

  return (
    <div className="flex w-full flex-col gap-space-lg">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 font-caption text-caption text-fg-faint">
          <span>ReconOS</span>
          <span aria-hidden="true">/</span>
          <span>Admin</span>
          <span aria-hidden="true">/</span>
          <span className="font-body-code text-primary">Audit Log</span>
        </div>
        <h1 className="font-headline-lg text-headline-lg tracking-tight text-fg">Audit Log</h1>
        <p className="max-w-2xl text-body-default text-fg-muted">
          Who did what, and when. Times are Vietnam time.
        </p>
      </div>

      <form
        onSubmit={onFilter}
        className="flex flex-wrap items-end gap-space-sm rounded-sm border border-border bg-surface p-space-sm"
      >
        <label htmlFor="audit-action" className={FIELD_LABEL}>
          Action
          <input
            id="audit-action"
            value={draftAction}
            onChange={(e) => setDraftAction(e.target.value)}
            className={FIELD}
          />
        </label>
        <label htmlFor="audit-from" className={FIELD_LABEL}>
          From
          <input
            id="audit-from"
            type="date"
            value={draftFrom}
            onChange={(e) => setDraftFrom(e.target.value)}
            className={FIELD}
          />
        </label>
        <label htmlFor="audit-to" className={FIELD_LABEL}>
          To
          <input
            id="audit-to"
            type="date"
            value={draftTo}
            onChange={(e) => setDraftTo(e.target.value)}
            className={FIELD}
          />
        </label>
        <button
          type="submit"
          className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-border-strong bg-surface-2 px-3.5 font-body-default text-body-default text-fg shadow-sm hover:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-fg-muted">
            filter_list
          </span>
          Filter
        </button>
      </form>
      {rangeError && (
        <p role="alert" className="text-body-default text-crit">
          The start date is after the end date.
        </p>
      )}

      <div className="w-full overflow-hidden rounded-sm border border-border bg-surface">
        {logs.isPending && (
          <p className="px-space-md py-space-xl text-body-default text-fg-muted">
            Loading the audit log…
          </p>
        )}
        {logs.isError && (
          // A failed background refetch keeps the last good page below this message.
          <p role="alert" className="px-space-md py-space-xl text-body-default text-crit">
            Could not load the audit log.
          </p>
        )}
        {logs.data !== undefined && (
          <>
            <AuditTable rows={logs.data.items} />
            <div className="border-t border-border bg-surface-2 px-space-md">
              <Pagination
                label="Audit log pagination"
                page={{
                  total: logs.data.total,
                  totalIsEstimate: logs.data.total_is_estimate,
                  nextCursor: logs.data.next_cursor,
                }}
                canGoBack={canGoBack}
                onBack={goBack}
                onNext={() => goNext(logs.data.next_cursor)}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
