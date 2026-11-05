'use client';

import { type ReactElement, useState } from 'react';

import { Pagination, useCursorStack } from '@/components/pagination';
import { useMe } from '@/lib/auth';
import {
  TOOL_GROUPS,
  type ToolModule,
  usePatchToolModule,
  useToolModules,
} from '@/lib/tool-modules';

import { ALERT_TEXT, CELL, HEAD, HEAD_ROW, PANEL, ROW, STATE_TEXT } from '../system/modal';
import { loadErrorText, PageHeader, saveErrorText } from '../system/states';
import { ModuleCards } from './module-cards';
import { ModuleForm } from './module-form';
import { RunModule } from './run-module';
import { GROUP_LABEL, GROUP_TONE, SWITCH_INPUT } from './tones';

const COUNT = new Intl.NumberFormat('en-US');

type View = 'grid' | 'table';

const GRID_WRAP = 'w-full';
const PAGER_TABLE = 'border-t border-border bg-surface-2 px-space-md';
const PAGER_GRID = 'rounded-sm border border-border bg-surface-2 px-space-md';

const SWITCH = 'flex items-center gap-1 rounded-sm px-2.5 py-1 text-body-code font-semibold';
const SWITCH_ON = `${SWITCH} border border-border-strong bg-surface text-primary`;
const SWITCH_OFF = `${SWITCH} border border-transparent text-fg-muted hover:bg-surface-3 hover:text-fg`;

const ROW_BUTTON =
  'rounded-sm border border-border px-space-sm py-space-xs text-body-default text-fg hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60';

function byGroup(modules: readonly ToolModule[]): ToolModule[] {
  return [...modules].sort(
    (a, b) =>
      TOOL_GROUPS.indexOf(a.group) - TOOL_GROUPS.indexOf(b.group) || a.name.localeCompare(b.name),
  );
}

type Open = { mode: 'configure' | 'run'; module: ToolModule } | null;

/** S18. Every role reads the list and may run a tool module; only a Superadmin changes one. */
export default function ModulesPage(): ReactElement {
  const me = useMe();
  const isSuperadmin = me.data?.role === 'superadmin';
  const { cursor, canGoBack, goNext, goBack } = useCursorStack();
  const modules = useToolModules(cursor);
  const toggle = usePatchToolModule();
  const [open, setOpen] = useState<Open>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [view, setView] = useState<View>('grid');
  const run = (m: ToolModule) => {
    setCreated(null);
    setOpen({ mode: 'run', module: m });
  };

  return (
    <div className="flex w-full flex-col gap-space-lg">
      <PageHeader
        title="Modules"
        description="One row per tool module. A job runs one tool module; Exploit jobs wait for approval by an Admin who did not create them."
      >
        <div
          role="group"
          aria-label="View"
          className="flex items-center rounded-sm border border-border bg-surface-2 p-0.5"
        >
          {(
            [
              ['grid', 'grid_view', 'Grid'],
              ['table', 'table_rows', 'Table'],
            ] as const
          ).map(([value, icon, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => setView(value)}
              className={view === value ? SWITCH_ON : SWITCH_OFF}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-icon">
                {icon}
              </span>
              {label}
            </button>
          ))}
        </div>
      </PageHeader>

      {created !== null && (
        <p role="status" className="text-body-default text-good">
          Job created for {created}.
        </p>
      )}
      {toggle.isError && (
        <p role="alert" className="text-body-default text-crit">
          {saveErrorText(toggle.error)}
        </p>
      )}

      {/* The grid draws its own cards; only the table sits in a panel. */}
      <div className={view === 'grid' ? GRID_WRAP : PANEL}>
        {modules.isPending && <p className={STATE_TEXT}>Loading the tool modules…</p>}
        {modules.isError && (
          <p role="alert" className={ALERT_TEXT}>
            {loadErrorText(modules.error, 'tool module list')}
          </p>
        )}
        {modules.data !== undefined && (
          <>
            {modules.data.items.length === 0 ? (
              <p className={STATE_TEXT}>No tool module is registered.</p>
            ) : view === 'grid' ? (
              <div className="pb-space-md">
                <ModuleCards
                  modules={byGroup(modules.data.items)}
                  isSuperadmin={isSuperadmin}
                  busy={toggle.isPending}
                  onToggle={(m) =>
                    toggle.mutate({ toolModuleId: m.id, body: { is_enabled: !m.is_enabled } })
                  }
                  onConfigure={(m) => setOpen({ mode: 'configure', module: m })}
                  onRun={run}
                />
              </div>
            ) : (
              <div className="w-full overflow-x-auto" tabIndex={0}>
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className={HEAD_ROW}>
                      <th scope="col" className={HEAD}>
                        Status
                      </th>
                      <th scope="col" className={HEAD}>
                        Tool module
                      </th>
                      <th scope="col" className={HEAD}>
                        Group
                      </th>
                      <th scope="col" className={HEAD}>
                        Concurrency
                      </th>
                      <th scope="col" className={HEAD}>
                        Rate limit
                      </th>
                      <th scope="col" className={HEAD}>
                        Timeout
                      </th>
                      <th scope="col" className={HEAD}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {byGroup(modules.data.items).map((m) => (
                      <tr key={m.id} className={ROW}>
                        <td className={CELL}>
                          {isSuperadmin ? (
                            <label className="inline-flex items-center gap-space-xs">
                              <input
                                type="checkbox"
                                role="switch"
                                checked={m.is_enabled}
                                disabled={toggle.isPending}
                                onChange={() =>
                                  toggle.mutate({
                                    toolModuleId: m.id,
                                    body: { is_enabled: !m.is_enabled },
                                  })
                                }
                                aria-label={`Enable ${m.name}`}
                                className={SWITCH_INPUT}
                              />
                              <span className="font-body-code text-body-code text-fg-muted">
                                {m.is_enabled ? 'Enabled' : 'Disabled'}
                              </span>
                            </label>
                          ) : (
                            <span className="font-body-code text-body-code text-fg-muted">
                              {m.is_enabled ? 'Enabled' : 'Disabled'}
                            </span>
                          )}
                        </td>
                        <td className={`${CELL} font-body-code text-body-code`}>{m.name}</td>
                        <td className={CELL}>
                          <span
                            className={`rounded-sm border px-space-xs font-body-code text-body-code ${GROUP_TONE[m.group]}`}
                          >
                            {GROUP_LABEL[m.group]}
                          </span>
                        </td>
                        <td className={`${CELL} font-body-code text-body-code`}>
                          {COUNT.format(m.max_concurrency)}
                        </td>
                        <td className={`${CELL} font-body-code text-body-code`}>
                          {m.rate_limit_per_minute === null
                            ? 'No limit'
                            : `${COUNT.format(m.rate_limit_per_minute)} / min`}
                        </td>
                        <td className={`${CELL} font-body-code text-body-code`}>
                          {COUNT.format(m.timeout_minutes)} min
                        </td>
                        <td className={CELL}>
                          <span className="flex gap-space-xs">
                            {isSuperadmin && (
                              <button
                                type="button"
                                aria-label={`Configure ${m.name}`}
                                onClick={() => setOpen({ mode: 'configure', module: m })}
                                className={ROW_BUTTON}
                              >
                                Configure
                              </button>
                            )}
                            <button
                              type="button"
                              aria-label={`Run ${m.name}`}
                              disabled={!m.is_enabled}
                              onClick={() => run(m)}
                              className={ROW_BUTTON}
                            >
                              Run
                            </button>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className={view === 'grid' ? PAGER_GRID : PAGER_TABLE}>
              <Pagination
                label="Tool module pagination"
                page={{
                  total: modules.data.total,
                  totalIsEstimate: modules.data.total_is_estimate,
                  nextCursor: modules.data.next_cursor,
                }}
                canGoBack={canGoBack}
                onBack={goBack}
                onNext={() => goNext(modules.data.next_cursor)}
              />
            </div>
          </>
        )}
      </div>

      {open?.mode === 'configure' && (
        <ModuleForm module={open.module} onClose={() => setOpen(null)} />
      )}
      {open?.mode === 'run' && (
        <RunModule
          module={open.module}
          onClose={() => setOpen(null)}
          onDone={() => {
            setCreated(open.module.name);
            setOpen(null);
          }}
        />
      )}
    </div>
  );
}
