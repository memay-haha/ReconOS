import type { ReactElement } from 'react';

import { formatMoment } from '@/lib/format-moment';
import type { Worker } from '@/lib/workers';

import { CELL, HEAD, HEAD_ROW, ROW } from './modal';

/** Tab Tools: tech-debt item 9 leaves binary versions and paths out, so this lists each
 * worker and the tool modules it reported in its last heartbeat. */
export function WorkersTable({ workers }: { workers: readonly Worker[] }): ReactElement {
  if (workers.length === 0) {
    return (
      <p className="px-space-md py-space-xl text-body-default text-fg-muted">
        No worker has registered yet.
      </p>
    );
  }
  return (
    <div className="w-full overflow-x-auto" tabIndex={0}>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className={HEAD_ROW}>
            <th scope="col" className={HEAD}>
              Worker
            </th>
            <th scope="col" className={HEAD}>
              Tool modules
            </th>
            <th scope="col" className={HEAD}>
              Last heartbeat
            </th>
          </tr>
        </thead>
        <tbody>
          {workers.map((w) => (
            <tr key={w.id} className={ROW}>
              <td className={`${CELL} text-body-code`}>{w.name}</td>
              <td className="px-space-md py-space-sm">
                {w.tool_modules.length === 0 ? (
                  <span className="text-fg-muted">None reported</span>
                ) : (
                  <ul className="flex flex-wrap gap-space-xs">
                    {w.tool_modules.map((m) => (
                      <li
                        key={m}
                        className="rounded-sm border border-border bg-surface-2 px-space-xs text-body-code text-fg"
                      >
                        {m}
                      </li>
                    ))}
                  </ul>
                )}
              </td>
              <td className={`${CELL} text-body-code`}>
                {w.last_heartbeat_at === null ? 'Never' : formatMoment(w.last_heartbeat_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
