'use client';

import type { ReactElement } from 'react';

import { useDispatcherStatus } from '@/lib/dispatcher';
import { formatMoment } from '@/lib/format-moment';
import { useWorkers } from '@/lib/workers';

import { errorText } from '../programs/error-text';
import { shortId } from '../programs/links';
import { ALERT, COUNT, NOTE, PANEL } from '../programs/ui';

const SECTION_LABEL = 'font-label-caps text-label-caps uppercase tracking-wider text-fg-faint';

/** Queued jobs per tool module as bars, the mockup's "by scan type" list (M7). */
function ToolModuleBars({
  counts,
  names,
}: {
  counts: Readonly<Record<string, number>>;
  names: ReadonlyMap<string, string>;
}): ReactElement {
  const rows = Object.entries(counts).sort(([, a], [, b]) => b - a);
  const max = rows.reduce((m, [, c]) => Math.max(m, c), 0);
  return (
    <div className="flex flex-col gap-space-sm">
      <span className={SECTION_LABEL}>By tool module</span>
      {rows.length === 0 ? (
        <p className="text-caption text-fg-muted">Nothing queued.</p>
      ) : (
        <ul className="flex flex-col gap-space-sm">
          {rows.map(([id, count]) => (
            <li key={id} className="flex flex-col gap-1">
              <span className="flex justify-between gap-space-sm font-caption text-caption">
                <span className="truncate font-body-code text-fg">
                  {names.get(id) ?? shortId(id)}
                </span>
                <span className="font-body-code-bold text-primary">
                  {COUNT.format(count)} queued
                </span>
              </span>
              <span
                aria-hidden="true"
                className="h-2 w-full overflow-hidden rounded-sm bg-surface-2"
              >
                <span
                  className="block h-full rounded-sm bg-primary-container"
                  style={{ width: `${max === 0 ? 0 : (count / max) * 100}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Queued jobs per program as tiles, the mockup's "by program" grid (M7). */
function ProgramTiles({
  counts,
  names,
}: {
  counts: Readonly<Record<string, number>>;
  names: ReadonlyMap<string, string>;
}): ReactElement {
  const rows = Object.entries(counts).sort(([, a], [, b]) => b - a);
  return (
    <div className="flex flex-col gap-space-sm border-t border-border pt-space-sm">
      <span className={SECTION_LABEL}>By program</span>
      {rows.length === 0 ? (
        <p className="text-caption text-fg-muted">Nothing queued.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-space-sm sm:grid-cols-2">
          {rows.map(([id, count]) => (
            <li
              key={id}
              className="flex items-center justify-between gap-space-sm rounded-sm border border-border bg-surface-2 p-2"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined text-[16px] text-fg-faint"
                >
                  folder
                </span>
                <span className="truncate font-body-code-bold text-caption text-fg">
                  {names.get(id) ?? shortId(id)}
                </span>
              </span>
              <span className="rounded-sm bg-surface-3 px-1.5 py-0.5 font-body-code-bold text-caption text-primary">
                {COUNT.format(count)} {count === 1 ? 'job' : 'jobs'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PanelHeader({
  icon,
  title,
  subtitle,
  aside,
}: {
  icon: string;
  title: string;
  subtitle: string;
  aside?: string | null;
}): ReactElement {
  return (
    <div className="flex items-center justify-between gap-space-sm border-b border-border pb-space-sm">
      <div className="flex items-center gap-space-sm">
        <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-primary">
          {icon}
        </span>
        <div>
          <h2 className="font-panel-title text-panel-title font-semibold leading-tight text-fg">
            {title}
          </h2>
          <p className="font-body-code text-caption text-fg-faint">{subtitle}</p>
        </div>
      </div>
      {aside != null && <span className="font-body-code text-caption text-fg-muted">{aside}</span>}
    </div>
  );
}

/** Dispatcher heartbeat and the Workers list. Workers is Superadmin and Admin only, so it
 * is not requested for User. */
export function DispatcherPanel({ showWorkers }: { showWorkers: boolean }): ReactElement {
  const status = useDispatcherStatus();
  const workers = useWorkers(null, showWorkers);

  return (
    <div className={`${PANEL} flex flex-col gap-space-md p-space-lg`}>
      <PanelHeader
        icon="precision_manufacturing"
        title="Dispatcher"
        subtitle="Hands queued jobs to workers"
      />
      {status.isPending && <p className={NOTE}>Loading the dispatcher status…</p>}
      {status.isError && (
        <p role="alert" className={ALERT}>
          {errorText(status.error, 'Could not load the dispatcher status.')}
        </p>
      )}
      {status.data !== undefined && (
        <dl className="grid grid-cols-1 gap-2 rounded-sm border border-border bg-surface-2 p-space-sm">
          <div>
            <dt className={SECTION_LABEL}>Last heartbeat</dt>
            <dd className="mt-0.5 font-body-code-bold text-body-default text-fg">
              {status.data.last_heartbeat_at === null
                ? 'Never'
                : formatMoment(status.data.last_heartbeat_at)}
            </dd>
          </div>
        </dl>
      )}
      {showWorkers && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className={SECTION_LABEL}>Workers</span>
            {workers.data !== undefined && (
              <span className="font-body-code text-caption text-fg-faint">
                {COUNT.format(workers.data.items.length)} registered
              </span>
            )}
          </div>
          {workers.isPending && <p className="text-caption text-fg-muted">Loading workers…</p>}
          {workers.isError && (
            <p role="alert" className="text-caption text-crit-strong">
              {errorText(workers.error, 'Could not load the workers.')}
            </p>
          )}
          {workers.data !== undefined && workers.data.items.length === 0 && (
            <p className="text-caption text-fg-muted">No worker has registered.</p>
          )}
          {workers.data !== undefined && workers.data.items.length > 0 && (
            <div className="overflow-hidden rounded-sm border border-border">
              <div
                aria-hidden="true"
                className="grid grid-cols-12 bg-surface-2 px-space-md py-1.5 font-label-caps text-label-caps uppercase text-fg-muted"
              >
                <span className="col-span-4">Worker</span>
                <span className="col-span-5">Tool modules</span>
                <span className="col-span-3 text-right">Last heartbeat</span>
              </div>
              <ul className="divide-y divide-border font-body-code text-caption">
                {workers.data.items.map((w) => (
                  <li
                    key={w.id}
                    className="grid grid-cols-12 items-center gap-x-space-xs px-space-md py-2 hover:bg-surface-3"
                  >
                    <span className="col-span-4 truncate font-body-code-bold text-fg">
                      {w.name}
                    </span>
                    <span className="col-span-5 flex flex-wrap gap-1">
                      {w.tool_modules.length === 0 ? (
                        <span className="text-fg-muted">No tool module</span>
                      ) : (
                        w.tool_modules.map((m) => (
                          <span
                            key={m}
                            className="rounded-sm border border-border bg-surface-3 px-1.5 text-primary"
                          >
                            {m}
                          </span>
                        ))
                      )}
                    </span>
                    <span className="col-span-3 text-right text-fg-muted">
                      {w.last_heartbeat_at === null ? 'Never' : formatMoment(w.last_heartbeat_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
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
    <div className={`${PANEL} flex flex-col gap-space-md p-space-lg`}>
      <PanelHeader
        icon="pie_chart"
        title="Queue Distribution"
        subtitle="Queued jobs waiting for a worker"
        aside={queued === null ? null : `${COUNT.format(queued)} queued`}
      />
      {status.isPending && <p className={NOTE}>Loading…</p>}
      {status.isError && (
        <p role="alert" className={ALERT}>
          {errorText(status.error, 'Could not load the queue distribution.')}
        </p>
      )}
      {status.data !== undefined && (
        <>
          <ToolModuleBars counts={status.data.queued_by_tool_module} names={toolModuleNames} />
          <ProgramTiles counts={status.data.queued_by_program} names={programNames} />
        </>
      )}
    </div>
  );
}
