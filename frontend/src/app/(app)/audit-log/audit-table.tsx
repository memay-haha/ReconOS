'use client';

import type { ReactElement } from 'react';

import type { AuditLogRow } from '@/lib/audit-logs';
import { formatMoment } from '@/lib/format-moment';

// Same density as the S12 account table (M7 of S12, no mockup of its own).
const HEAD = 'px-3 py-2 font-label-caps text-label-caps uppercase text-fg-muted';
const HEAD_FIRST = 'px-4 py-2 font-label-caps text-label-caps uppercase text-fg-muted';
const CELL = 'px-3 py-2.5 whitespace-nowrap';
const CELL_FIRST = 'px-4 py-2.5 whitespace-nowrap font-body-code text-[11px] text-fg';

/** A row with neither a user nor a worker was written by the system itself. */
function Actor({ row }: { row: AuditLogRow }): ReactElement {
  if (row.user_id !== null) {
    return (
      <>
        <span className="text-fg-muted">User </span>
        <span className="font-body-code text-body-code">{row.user_id}</span>
      </>
    );
  }
  if (row.worker_id != null) {
    return (
      <>
        <span className="text-fg-muted">Worker </span>
        <span className="font-body-code text-body-code">{row.worker_id}</span>
      </>
    );
  }
  return <span className="text-fg-muted">System</span>;
}

function resource(row: AuditLogRow): string {
  if (row.resource_type === null) return 'No resource attached';
  return row.resource_id === null ? row.resource_type : `${row.resource_type} ${row.resource_id}`;
}

export function AuditTable({ rows }: { rows: readonly AuditLogRow[] }): ReactElement {
  if (rows.length === 0) {
    return (
      <p className="py-space-xl text-center text-body-default text-fg-muted">
        No audit entries match.
      </p>
    );
  }

  return (
    // Focusable so a keyboard user can scroll the table sideways on a narrow screen.
    <div className="w-full overflow-x-auto" tabIndex={0}>
      <table className="w-full border-collapse text-left text-body-default text-fg">
        <caption className="sr-only">Audit log entries, newest first</caption>
        <thead>
          <tr className="h-10 border-b border-border bg-surface-2">
            <th scope="col" className={HEAD_FIRST}>
              When
            </th>
            <th scope="col" className={HEAD}>
              Actor
            </th>
            <th scope="col" className={HEAD}>
              Action
            </th>
            <th scope="col" className={HEAD}>
              Resource
            </th>
            <th scope="col" className={HEAD}>
              IP address
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-border transition-colors last:border-b-0 hover:bg-surface-3"
            >
              <td className={CELL_FIRST}>{formatMoment(row.created_at)}</td>
              <td className={CELL}>
                <Actor row={row} />
              </td>
              <td className={CELL}>
                <span className="rounded-sm border border-neutral-bd bg-neutral-soft px-2 py-0.5 font-body-code text-[11px] font-semibold text-fg-muted">
                  {row.action}
                </span>
              </td>
              <td className={`${CELL} text-fg-muted`}>{resource(row)}</td>
              <td className={`${CELL} font-body-code text-[11px] text-fg-muted`}>
                {row.ip_address ?? 'Address unknown'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
