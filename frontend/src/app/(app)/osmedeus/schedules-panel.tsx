'use client';

import type { ReactElement } from 'react';

import { Pagination, useCursorStack } from '@/components/pagination';
import type { Engine } from '@/lib/engines';
import { formatMoment } from '@/lib/format-moment';
import { formatInterval, useSchedules } from '@/lib/schedules';

import { loadErrorText } from '../system/states';
import { ENGINE_PANEL, PanelTitle } from './panel-title';

const HEAD = 'px-space-md py-2 font-label-caps text-label-caps uppercase text-fg-muted';
const CELL = 'px-space-md py-2.5';

/** S16 Schedules tab (P4): ReconOS schedules whose tool module runs on this engine, read from
 * `GET /schedules?engine_id=`. Read-only here; schedules are edited on the program (S09). */
export function SchedulesPanel({ engine }: { engine: Engine }): ReactElement {
  const { cursor, canGoBack, goNext, goBack } = useCursorStack();
  const schedules = useSchedules({ engineId: engine.id }, cursor);

  return (
    <section
      id="schedules"
      aria-label="Engine schedules"
      className={`${ENGINE_PANEL} scroll-mt-20`}
    >
      <PanelTitle
        bar="primary"
        title="Schedules"
        subtitle="Recurring ReconOS schedules whose tool module runs on this engine."
      />
      {schedules.isPending && <p className="text-body-default text-fg-muted">Loading schedules…</p>}
      {schedules.isError && (
        <p role="alert" className="text-body-default text-crit">
          {loadErrorText(schedules.error, 'schedule list')}
        </p>
      )}
      {schedules.data !== undefined && schedules.data.items.length === 0 && (
        <p className="text-body-default text-fg-muted">
          No schedule runs a tool module on this engine.
        </p>
      )}
      {schedules.data !== undefined && schedules.data.items.length > 0 && (
        <div className="overflow-x-auto rounded-sm border border-border" tabIndex={0}>
          <table className="w-full min-w-[760px] border-collapse text-left text-body-default">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th scope="col" className={HEAD}>
                  Program
                </th>
                <th scope="col" className={HEAD}>
                  Tool Module
                </th>
                <th scope="col" className={HEAD}>
                  Target
                </th>
                <th scope="col" className={HEAD}>
                  Interval
                </th>
                <th scope="col" className={HEAD}>
                  Status
                </th>
                <th scope="col" className={HEAD}>
                  Last Run
                </th>
                <th scope="col" className={HEAD}>
                  Next Run
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {schedules.data.items.map((s) => (
                <tr key={s.id} className="hover:bg-surface-2">
                  <td className={`${CELL} text-fg`}>{s.program_name}</td>
                  <td className={`${CELL} font-body-code text-body-code text-primary`}>
                    {s.tool_module_name}
                  </td>
                  <td className={`${CELL} break-all font-body-code text-body-code text-fg-muted`}>
                    {s.target.join(', ')}
                  </td>
                  <td className={`${CELL} whitespace-nowrap font-body-code text-fg`}>
                    {formatInterval(s.interval_minutes)}
                  </td>
                  <td className={CELL}>
                    <span
                      className={`rounded-sm px-1.5 py-0.5 font-body-code text-[10px] uppercase ${s.is_enabled ? 'bg-good-soft text-good' : 'bg-surface-3 text-fg-muted'}`}
                    >
                      {s.is_enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td className={`${CELL} whitespace-nowrap font-body-code text-fg-muted`}>
                    {s.last_run_at === null ? 'Never' : formatMoment(s.last_run_at)}
                  </td>
                  <td className={`${CELL} whitespace-nowrap font-body-code text-fg-muted`}>
                    {s.is_enabled ? formatMoment(s.next_run_at) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {schedules.data !== undefined && (
        <Pagination
          label="Engine schedule pagination"
          page={{
            total: schedules.data.total,
            totalIsEstimate: schedules.data.total_is_estimate,
            nextCursor: schedules.data.next_cursor,
          }}
          shown={schedules.data.items.length}
          noun="schedules"
          canGoBack={canGoBack}
          onBack={goBack}
          onNext={() => goNext(schedules.data.next_cursor)}
        />
      )}
    </section>
  );
}
