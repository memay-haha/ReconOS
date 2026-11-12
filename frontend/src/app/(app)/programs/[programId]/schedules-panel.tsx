'use client';

import { type FormEvent, type ReactElement, useState } from 'react';

import { FieldError } from '@/components/field-error';
import { Pagination, useCursorStack } from '@/components/pagination';
import { fieldErrorsOf } from '@/lib/api-client';
import { formatMoment } from '@/lib/format-moment';
import {
  formatInterval,
  MAX_INTERVAL_MINUTES,
  MIN_INTERVAL_MINUTES,
  type Schedule,
  useCreateSchedule,
  useDeleteSchedule,
  useSchedules,
  useUpdateSchedule,
} from '@/lib/schedules';
import type { ToolModule } from '@/lib/tool-modules';

import { errorText } from '../error-text';
import { ALERT, DANGER_BUTTON, FIELD, LABEL, NOTE, PANEL, ROW_BUTTON, TD, TH } from '../ui';

function ScheduleForm({
  programId,
  toolModules,
}: {
  programId: string;
  toolModules: readonly ToolModule[];
}): ReactElement {
  const create = useCreateSchedule(programId);
  const enabled = toolModules.filter((m) => m.is_enabled);
  const [toolModuleId, setToolModuleId] = useState(enabled[0]?.id ?? '');
  const [targets, setTargets] = useState('');
  const [interval, setIntervalMinutes] = useState('1440');
  const errors = fieldErrorsOf(create.error);
  const failed =
    create.error !== null && Object.keys(errors).length === 0
      ? errorText(create.error, 'Could not create the schedule.')
      : null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate(
      {
        tool_module_id: toolModuleId,
        target: targets
          .split('\n')
          .map((t) => t.trim())
          .filter((t) => t !== ''),
        interval_minutes: Number.parseInt(interval, 10),
      },
      { onSuccess: () => setTargets('') },
    );
  };

  return (
    <form
      onSubmit={submit}
      aria-label="New schedule"
      className="grid grid-cols-1 gap-space-sm bg-surface md:grid-cols-4"
      noValidate
    >
      <div className="flex flex-col gap-space-xs">
        <label htmlFor="schedule-tool-module" className={LABEL}>
          Tool module
        </label>
        <select
          id="schedule-tool-module"
          value={toolModuleId}
          onChange={(e) => setToolModuleId(e.target.value)}
          className={FIELD}
        >
          {enabled.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <FieldError errors={errors} field="tool_module_id" />
      </div>
      <div className="flex flex-col gap-space-xs md:col-span-2">
        <label htmlFor="schedule-targets" className={LABEL}>
          Targets, one per line
        </label>
        <textarea
          id="schedule-targets"
          rows={2}
          value={targets}
          onChange={(e) => setTargets(e.target.value)}
          className="w-full rounded-sm border border-border bg-surface-2 px-space-md py-space-sm font-body-code text-body-code text-fg focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <FieldError errors={errors} field="target" />
      </div>
      <div className="flex flex-col gap-space-xs">
        <label htmlFor="schedule-interval" className={LABEL}>
          Every (minutes)
        </label>
        <input
          id="schedule-interval"
          type="number"
          min={MIN_INTERVAL_MINUTES}
          max={MAX_INTERVAL_MINUTES}
          value={interval}
          onChange={(e) => setIntervalMinutes(e.target.value)}
          className={FIELD}
        />
        <FieldError errors={errors} field="interval_minutes" />
      </div>
      <div className="flex items-center gap-space-sm md:col-span-4">
        <button type="submit" disabled={create.isPending} className={ROW_BUTTON}>
          Add schedule
        </button>
        {failed !== null && (
          <p role="alert" className="text-body-default text-crit-strong">
            {failed}
          </p>
        )}
      </div>
    </form>
  );
}

function ScheduleActions({ schedule }: { schedule: Schedule }): ReactElement {
  const update = useUpdateSchedule();
  const remove = useDeleteSchedule();
  const error = update.error ?? remove.error;
  return (
    <span className="flex flex-wrap gap-space-xs">
      <button
        type="button"
        disabled={update.isPending}
        onClick={() =>
          update.mutate({ id: schedule.id, body: { is_enabled: !schedule.is_enabled } })
        }
        className={ROW_BUTTON}
      >
        {schedule.is_enabled ? 'Disable' : 'Enable'}
      </button>
      <button
        type="button"
        disabled={remove.isPending}
        onClick={() => remove.mutate(schedule.id)}
        className={DANGER_BUTTON}
      >
        Delete
      </button>
      {error !== null && (
        <span role="alert" className="text-caption text-crit-strong">
          {errorText(error, 'Could not change the schedule.')}
        </span>
      )}
    </span>
  );
}

/** The schedules tab. Jobs a schedule creates show "Schedule" as their creator. */
export function SchedulesPanel({
  programId,
  canManage,
  toolModules,
}: {
  programId: string;
  canManage: boolean;
  toolModules: readonly ToolModule[];
}): ReactElement {
  const { cursor, canGoBack, goNext, goBack } = useCursorStack();
  const schedules = useSchedules({ programId }, cursor);

  return (
    <div className={`${PANEL} flex flex-col gap-space-md p-space-md`}>
      <h2 className="font-panel-title text-panel-title text-fg">Schedules</h2>
      {canManage && <ScheduleForm programId={programId} toolModules={toolModules} />}
      {schedules.isPending && <p className={NOTE}>Loading schedules…</p>}
      {schedules.isError && (
        <p role="alert" className={ALERT}>
          {errorText(schedules.error, 'Could not load the schedules.')}
        </p>
      )}
      {schedules.data !== undefined && schedules.data.items.length === 0 && (
        <p className={NOTE}>No schedules. Jobs for this program are created manually.</p>
      )}
      {schedules.data !== undefined && schedules.data.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead className="border-b border-border bg-surface-2">
              <tr>
                <th className={TH}>Tool module</th>
                <th className={TH}>Target</th>
                <th className={TH}>Every</th>
                <th className={TH}>Next run</th>
                <th className={TH}>Last run</th>
                <th className={TH}>Enabled</th>
                {canManage && <th className={TH}>Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {schedules.data.items.map((s) => (
                <tr key={s.id}>
                  <td className={TD}>{s.tool_module_name}</td>
                  <td className={`${TD} break-all font-body-code`}>{s.target.join(', ')}</td>
                  <td className={TD}>{formatInterval(s.interval_minutes)}</td>
                  <td className={TD}>{s.is_enabled ? formatMoment(s.next_run_at) : '-'}</td>
                  <td className={TD}>
                    {s.last_run_at === null ? 'Never' : formatMoment(s.last_run_at)}
                  </td>
                  <td className={TD}>{s.is_enabled ? 'Yes' : 'No'}</td>
                  {canManage && (
                    <td className={TD}>
                      <ScheduleActions schedule={s} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {schedules.data !== undefined && (
        <Pagination
          label="Schedule list pagination"
          page={{
            total: schedules.data.total,
            totalIsEstimate: schedules.data.total_is_estimate,
            nextCursor: schedules.data.next_cursor,
          }}
          canGoBack={canGoBack}
          onBack={goBack}
          onNext={() => goNext(schedules.data.next_cursor)}
        />
      )}
    </div>
  );
}
