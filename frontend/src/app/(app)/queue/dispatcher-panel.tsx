'use client';

import type { ReactElement } from 'react';

import { useDispatcherStatus } from '@/lib/dispatcher';
import { formatMoment } from '@/lib/format-moment';
import { useWorkers } from '@/lib/workers';

import { errorText } from '../programs/error-text';
import { shortId } from '../programs/links';
import { ALERT, COUNT, NOTE, PANEL } from '../programs/ui';

function Distribution({
  heading,
  counts,
  names,
}: {
  heading: string;
  counts: Readonly<Record<string, number>>;
  names: ReadonlyMap<string, string>;
}): ReactElement {
  const rows = Object.entries(counts).sort(([, a], [, b]) => b - a);
  return (
    <div className="flex flex-col gap-space-xs">
      <span className="font-label-caps text-label-caps uppercase text-fg-faint">{heading}</span>
      {rows.length === 0 ? (
        <p className="text-body-default text-fg-muted">Nothing queued.</p>
      ) : (
        <ul className="flex flex-col gap-space-xs">
          {rows.map(([id, count]) => (
            <li key={id} className="flex items-center justify-between gap-space-sm">
              <span className="truncate font-body-code text-body-code text-fg">
                {names.get(id) ?? shortId(id)}
              </span>
              <span className="font-body-code text-caption text-fg-muted">
                {COUNT.format(count)} {count === 1 ? 'job' : 'jobs'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Dispatcher heartbeat and the Workers list. Workers is Superadmin and Admin only, so it
 * is not requested for User. */
export function DispatcherPanel({ showWorkers }: { showWorkers: boolean }): ReactElement {
  const status = useDispatcherStatus();
  const workers = useWorkers(null, showWorkers);

  return (
    <div className={`${PANEL} flex flex-col gap-space-md p-space-md`}>
      <div className="flex items-center gap-space-sm">
        <span aria-hidden="true" className="material-symbols-outlined text-icon text-fg-muted">
          precision_manufacturing
        </span>
        <h2 className="font-panel-title text-panel-title text-fg">Dispatcher</h2>
      </div>
      {status.isPending && <p className={NOTE}>Loading the dispatcher status…</p>}
      {status.isError && (
        <p role="alert" className={ALERT}>
          {errorText(status.error, 'Could not load the dispatcher status.')}
        </p>
      )}
      {status.data !== undefined && (
        <dl className="grid grid-cols-2 gap-space-sm">
          <dt className="text-caption text-fg-faint">Last heartbeat</dt>
          <dd className="font-body-code text-body-code text-fg">
            {status.data.last_heartbeat_at === null
              ? 'Never'
              : formatMoment(status.data.last_heartbeat_at)}
          </dd>
        </dl>
      )}
      {showWorkers && (
        <div className="flex flex-col gap-space-sm border-t border-border pt-space-md">
          <span className="font-label-caps text-label-caps uppercase text-fg-faint">Workers</span>
          {workers.isPending && <p className="text-body-default text-fg-muted">Loading workers…</p>}
          {workers.isError && (
            <p role="alert" className="text-body-default text-crit-strong">
              {errorText(workers.error, 'Could not load the workers.')}
            </p>
          )}
          {workers.data !== undefined && workers.data.items.length === 0 && (
            <p className="text-body-default text-fg-muted">No worker has registered.</p>
          )}
          {workers.data !== undefined && workers.data.items.length > 0 && (
            <ul className="flex flex-col divide-y divide-border">
              {workers.data.items.map((w) => (
                <li key={w.id} className="flex flex-col gap-0.5 py-space-xs">
                  <span className="font-body-code text-body-code text-fg">{w.name}</span>
                  <span className="text-caption text-fg-muted">
                    {w.tool_modules.length === 0 ? 'No tool module' : w.tool_modules.join(', ')}
                  </span>
                  <span className="text-caption text-fg-faint">
                    Last heartbeat:{' '}
                    {w.last_heartbeat_at === null ? 'never' : formatMoment(w.last_heartbeat_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Queued jobs by tool module and by program, from the same dispatcher status. */
export function DistributionPanel({
  toolModuleNames,
  programNames,
}: {
  toolModuleNames: ReadonlyMap<string, string>;
  programNames: ReadonlyMap<string, string>;
}): ReactElement {
  const status = useDispatcherStatus();
  const queued =
    status.data === undefined
      ? null
      : Object.values(status.data.queued_by_tool_module).reduce((a, b) => a + b, 0);
  return (
    <div className={`${PANEL} flex flex-col gap-space-md p-space-md`}>
      <div className="flex items-center justify-between gap-space-sm">
        <div className="flex items-center gap-space-sm">
          <span aria-hidden="true" className="material-symbols-outlined text-icon text-fg-muted">
            pie_chart
          </span>
          <h2 className="font-panel-title text-panel-title text-fg">Queue Distribution</h2>
        </div>
        {queued !== null && (
          <span className="font-body-code text-caption text-fg-muted">
            {COUNT.format(queued)} queued
          </span>
        )}
      </div>
      {status.isPending && <p className={NOTE}>Loading…</p>}
      {status.isError && (
        <p role="alert" className={ALERT}>
          {errorText(status.error, 'Could not load the queue distribution.')}
        </p>
      )}
      {status.data !== undefined && (
        <div className="grid grid-cols-1 gap-space-md sm:grid-cols-2">
          <Distribution
            heading="By tool module"
            counts={status.data.queued_by_tool_module}
            names={toolModuleNames}
          />
          <Distribution
            heading="By program"
            counts={status.data.queued_by_program}
            names={programNames}
          />
        </div>
      )}
    </div>
  );
}
