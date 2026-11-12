'use client';

import { type ReactElement, useState } from 'react';

import { type Tool, type ToolStatus, useTools } from '@/lib/tools';

import { ALERT_TEXT, STATE_TEXT } from './modal';
import { loadErrorText } from './states';

const COUNT = new Intl.NumberFormat('en-US');

type Filter = 'all' | ToolStatus;

const STATUS: Readonly<Record<ToolStatus, { icon: string; tone: string }>> = {
  installed: { icon: 'check_circle', tone: 'border-good-bd bg-good-soft text-good' },
  missing: { icon: 'error', tone: 'border-crit-bd bg-crit-soft text-crit' },
};

const BADGE = 'rounded-sm border px-2.5 py-1';
const BADGE_ON = `${BADGE} border-accent-soft-bd bg-surface-3 text-primary`;
const BADGE_OFF = `${BADGE} border-border bg-surface text-fg-muted hover:text-fg`;
const HEAD = 'px-space-md py-2.5 font-semibold';
const CELL = 'px-space-md py-2.5';

/** "v1.3.8", or "v1.3.8, v1.3.7" when the workers disagree. */
function versions(tool: Tool): string {
  const seen = Array.from(
    new Set(tool.installed.map((i) => i.version).filter((v): v is string => v !== null)),
  );
  if (seen.length > 0) return seen.join(', ');
  return tool.installed.length > 0 ? 'Unknown' : 'Not installed';
}

/** The Tools panel of S15 (D4): every tool of the tool modules, with the versions the online
 * workers reported. Tools ship in the worker image, so there is no Update and no upstream. */
export function ToolsSection({ enabled }: { enabled: boolean }): ReactElement {
  const tools = useTools(enabled);
  const [filter, setFilter] = useState<Filter>('all');
  const items = tools.data?.items ?? [];
  const count = (status: Filter) =>
    status === 'all' ? items.length : items.filter((t) => t.status === status).length;
  const shown = filter === 'all' ? items : items.filter((t) => t.status === filter);
  const workers = new Set(items.flatMap((t) => t.installed.map((i) => i.worker_name))).size;

  return (
    <section
      aria-label="Tools"
      className="flex flex-col overflow-hidden rounded-sm border border-border bg-surface"
    >
      <div className="flex flex-col justify-between gap-space-sm border-b border-border bg-surface-2 px-space-md py-space-sm md:flex-row md:items-center">
        <div className="flex items-center gap-space-sm">
          <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-primary">
            build
          </span>
          <h2 className="text-panel-title font-semibold text-fg">Tools</h2>
          {tools.data !== undefined && (
            <span className="rounded-sm border border-border bg-surface px-1.5 font-body-code text-caption text-fg-muted">
              {COUNT.format(items.length)} tracked
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto font-body-code text-caption">
          {(['all', 'installed', 'missing'] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={filter === f ? BADGE_ON : BADGE_OFF}
            >
              {`${f === 'all' ? 'All' : f === 'installed' ? 'Installed' : 'Missing'} (${COUNT.format(count(f))})`}
            </button>
          ))}
        </div>
      </div>
      {tools.isPending && <p className={STATE_TEXT}>Loading the tools…</p>}
      {tools.isError && (
        <p role="alert" className={ALERT_TEXT}>
          {loadErrorText(tools.error, 'tool list')}
        </p>
      )}
      {tools.data !== undefined && (
        <>
          {shown.length === 0 ? (
            <p className={STATE_TEXT}>No tools match.</p>
          ) : (
            <div className="overflow-x-auto" tabIndex={0}>
              <table className="w-full border-collapse text-left font-body-code text-body-code">
                <thead>
                  <tr className="border-b border-border bg-surface-2 font-label-caps text-[11px] uppercase tracking-wider text-fg-muted">
                    <th scope="col" className={HEAD}>
                      Tool
                    </th>
                    <th scope="col" className={HEAD}>
                      Tool Modules
                    </th>
                    <th scope="col" className={HEAD}>
                      Installed Version
                    </th>
                    <th scope="col" className={HEAD}>
                      Status
                    </th>
                    <th scope="col" className={`${HEAD} text-right`}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {shown.map((tool) => {
                    const status = STATUS[tool.status];
                    return (
                      <tr key={tool.name} className="transition-colors hover:bg-surface-2">
                        <td className={`${CELL} font-semibold text-fg`}>{tool.name}</td>
                        <td className={CELL}>
                          <span className="flex flex-wrap gap-1">
                            {tool.tool_modules.map((m) => (
                              <span
                                key={m}
                                className="rounded-sm border border-neutral-bd bg-neutral-soft px-1.5 py-0.5 text-[10.5px] text-fg-muted"
                              >
                                {m}
                              </span>
                            ))}
                          </span>
                        </td>
                        <td
                          className={`${CELL} ${tool.status === 'missing' ? 'text-fg-faint' : 'text-fg'}`}
                          title={tool.installed
                            .map((i) => `${i.worker_name}: ${i.version ?? 'unknown'}`)
                            .join('\n')}
                        >
                          {versions(tool)}
                        </td>
                        <td className={CELL}>
                          <span
                            className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10.5px] font-semibold ${status.tone}`}
                          >
                            <span
                              aria-hidden="true"
                              className="material-symbols-outlined text-[12px]"
                            >
                              {status.icon}
                            </span>
                            {tool.status}
                          </span>
                        </td>
                        <td className={`${CELL} text-right`}>
                          <button
                            type="button"
                            aria-label={`Recheck ${tool.name}`}
                            onClick={() => void tools.refetch()}
                            disabled={tools.isFetching}
                            className="rounded-sm border border-border bg-surface-2 px-2 py-0.5 text-[11px] text-fg-muted transition-colors hover:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                          >
                            Recheck
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface-2 px-space-md py-2 font-body-code text-caption text-fg-faint">
            <span className="flex items-center gap-space-sm">
              <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-good" />
              Versions from worker heartbeats
            </span>
            <span>{`${COUNT.format(workers)} ${workers === 1 ? 'worker' : 'workers'} reporting`}</span>
          </div>
        </>
      )}
    </section>
  );
}
