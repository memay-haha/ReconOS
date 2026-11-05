'use client';

import { type FormEvent, type ReactElement, useState } from 'react';

import { Pagination, useCursorStack } from '@/components/pagination';
import { formatMoment } from '@/lib/format-moment';
import {
  LOG_LEVELS,
  LOG_SERVICES,
  type LogFilter,
  type LogLevel,
  useDeleteLogs,
  useLogs,
} from '@/lib/logs';

import {
  ALERT_TEXT,
  BUTTON_DANGER,
  BUTTON_SECONDARY,
  CELL,
  FIELD,
  HEAD,
  HEAD_ROW,
  LABEL,
  Modal,
  PANEL,
  ROW,
  STATE_TEXT,
} from './modal';
import { loadErrorText, saveErrorText } from './states';

const LEVEL_TONE: Readonly<Record<LogLevel, string>> = {
  info: 'bg-info-soft text-info border-info-bd',
  warning: 'bg-warn-soft text-warn border-warn-bd',
  error: 'bg-crit-soft text-crit border-crit-bd',
  critical: 'bg-crit-strong-soft text-crit border-crit-strong-bd',
};

/** A calendar day in Vietnam, the zone every date on screen is shown in, as an instant. */
function dayBoundary(day: string, end: boolean): string | null {
  if (day === '') return null;
  const instant = new Date(`${day}T${end ? '23:59:59.999' : '00:00:00.000'}+07:00`);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}

/** The latest day a Superadmin may pick: yesterday in UTC, the zone the backend checks
 * `before` in. Picking today would be allowed by the contract but deletes nothing more. */
export function latestDeleteDay(now: Date = new Date()): string {
  return new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
}

function dayText(day: string): string {
  const [y, m, d] = day.split('-');
  return `${d}/${m}/${y}`;
}

function DeleteLogs({ onClose }: { onClose: () => void }): ReactElement {
  const [day, setDay] = useState('');
  const [tooLate, setTooLate] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const remove = useDeleteLogs();
  const max = latestDeleteDay();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (day === '') return;
    if (day > max) {
      setTooLate(true);
      return;
    }
    setTooLate(false);
    if (!confirming) {
      setConfirming(true);
      return;
    }
    remove.mutate(day, { onSuccess: onClose });
  };

  return (
    <Modal title="Delete application logs" busy={remove.isPending} onClose={onClose}>
      {/* noValidate: the screen says why a day is refused instead of a silent browser tooltip. */}
      <form noValidate onSubmit={submit} className="flex flex-col gap-gutter">
        <label htmlFor="logs-before" className={LABEL}>
          Delete every day before
          <input
            id="logs-before"
            type="date"
            required
            max={max}
            value={day}
            onChange={(e) => {
              setDay(e.target.value);
              setConfirming(false);
            }}
            className={FIELD}
          />
        </label>
        <p className="text-body-default text-fg-muted">
          Today&apos;s log is never deleted. The audit log records who deleted and the day chosen.
        </p>
        {tooLate && (
          <p role="alert" className="text-body-default text-crit">
            Pick a day before today.
          </p>
        )}
        {confirming && (
          <p
            role="alert"
            className="rounded-sm border border-crit-bd bg-crit-soft px-space-md py-space-sm text-body-default text-crit"
          >
            This deletes every application log entry from before {dayText(day)} and cannot be
            undone. Press Delete logs again to confirm.
          </p>
        )}
        {remove.isError && (
          <p role="alert" className="text-body-default text-crit">
            {saveErrorText(remove.error)}
          </p>
        )}
        <div className="flex justify-end gap-space-sm">
          <button
            type="button"
            onClick={onClose}
            disabled={remove.isPending}
            className={BUTTON_SECONDARY}
          >
            Cancel
          </button>
          <button type="submit" disabled={remove.isPending} className={BUTTON_DANGER}>
            {remove.isPending ? 'Deleting…' : 'Delete logs'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const NO_FILTER: LogFilter = { level: null, service: null, loggedFrom: null, loggedTo: null };

export function LogPanel({ canDelete }: { canDelete: boolean }): ReactElement {
  const [level, setLevel] = useState('');
  const [service, setService] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rangeError, setRangeError] = useState(false);
  const [filter, setFilter] = useState<LogFilter>(NO_FILTER);
  const [deleting, setDeleting] = useState(false);
  const { cursor, canGoBack, goNext, goBack, reset } = useCursorStack();
  const logs = useLogs(filter, cursor);

  const onFilter = (event: FormEvent) => {
    event.preventDefault();
    if (from !== '' && to !== '' && from > to) {
      setRangeError(true);
      return;
    }
    setRangeError(false);
    setFilter({
      level: level === '' ? null : (level as LogLevel),
      service: service === '' ? null : service,
      loggedFrom: dayBoundary(from, false),
      loggedTo: dayBoundary(to, true),
    });
    reset();
  };

  return (
    <div className="flex flex-col gap-space-md">
      <div className="flex flex-wrap items-end justify-between gap-space-sm">
        <form onSubmit={onFilter} className="flex flex-wrap items-end gap-space-sm">
          <label htmlFor="log-level" className={LABEL}>
            Level
            <select
              id="log-level"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className={FIELD}
            >
              <option value="">All levels</option>
              {LOG_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="log-service" className={LABEL}>
            Service
            <select
              id="log-service"
              value={service}
              onChange={(e) => setService(e.target.value)}
              className={FIELD}
            >
              <option value="">All services</option>
              {LOG_SERVICES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="log-from" className={LABEL}>
            From
            <input
              id="log-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={FIELD}
            />
          </label>
          <label htmlFor="log-to" className={LABEL}>
            To
            <input
              id="log-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={FIELD}
            />
          </label>
          <button type="submit" className={`${BUTTON_SECONDARY} h-10`}>
            Filter
          </button>
        </form>
        {canDelete && (
          <button type="button" onClick={() => setDeleting(true)} className={BUTTON_DANGER}>
            Delete logs…
          </button>
        )}
      </div>
      {rangeError && (
        <p role="alert" className="text-body-default text-crit">
          The start date is after the end date.
        </p>
      )}
      <div className={PANEL}>
        {logs.isPending && <p className={STATE_TEXT}>Loading the application log…</p>}
        {logs.isError && (
          <p role="alert" className={ALERT_TEXT}>
            {loadErrorText(logs.error, 'application log')}
          </p>
        )}
        {logs.data !== undefined && (
          <>
            {logs.data.items.length === 0 ? (
              <p className={STATE_TEXT}>No log entries match.</p>
            ) : (
              <div className="w-full overflow-x-auto" tabIndex={0}>
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className={HEAD_ROW}>
                      <th scope="col" className={HEAD}>
                        Time
                      </th>
                      <th scope="col" className={HEAD}>
                        Level
                      </th>
                      <th scope="col" className={HEAD}>
                        Service
                      </th>
                      <th scope="col" className={HEAD}>
                        Event
                      </th>
                      <th scope="col" className={HEAD}>
                        Context
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.data.items.map((l) => (
                      <tr key={l.id} className={ROW}>
                        <td className={`${CELL} text-body-code`}>{formatMoment(l.logged_at)}</td>
                        <td className={CELL}>
                          <span
                            className={`rounded-sm border px-space-xs text-body-code ${LEVEL_TONE[l.level]}`}
                          >
                            {l.level}
                          </span>
                        </td>
                        <td className={`${CELL} text-body-code`}>{l.service}</td>
                        <td className={`${CELL} text-body-code`}>{l.event}</td>
                        <td className="max-w-md px-space-md py-space-sm">
                          <code className="block truncate text-body-code text-fg-muted">
                            {l.context === null ? '' : JSON.stringify(l.context)}
                          </code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="border-t border-border bg-surface-2 px-space-md">
              <Pagination
                label="Application log pagination"
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
      {deleting && <DeleteLogs onClose={() => setDeleting(false)} />}
    </div>
  );
}
