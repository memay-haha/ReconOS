'use client';

import type { ReactElement } from 'react';

import type { AuditLogRow } from '@/lib/audit-logs';
import { formatMoment } from '@/lib/format-moment';

const HEAD = 'px-space-md py-space-sm';
const CELL = 'px-space-md py-space-sm whitespace-nowrap';

/** A row with neither a user nor a worker was written by the system itself. */
function Actor({ row }: { row: AuditLogRow }): ReactElement {
  if (row.user_id !== null) {
    return (
      <>
        <span className="text-fg-muted">User </span>
        <span className="text-body-code">{row.user_id}</span>
      </>
    );
  }
  if (row.worker_id != null) {
    return (
      <>
        <span className="text-fg-muted">Worker </span>
        <span className="text-body-code">{row.worker_id}</span>
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
          <tr className="h-8 border-b border-border bg-surface-2 text-label-caps uppercase text-fg-muted">
            <th scope="col" className={HEAD}>
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
            <tr key={row.id} className="border-b border-border last:border-b-0">
              <td className={CELL}>{formatMoment(row.created_at)}</td>
              <td className={CELL}>
                <Actor row={row} />
              </td>
              <td className={`${CELL} text-body-code`}>{row.action}</td>
              <td className={CELL}>{resource(row)}</td>
              <td className={CELL}>{row.ip_address ?? 'Address unknown'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
