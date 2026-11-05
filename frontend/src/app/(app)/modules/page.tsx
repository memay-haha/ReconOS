'use client';

import { type ReactElement, useState } from 'react';

import { Pagination, useCursorStack } from '@/components/pagination';
import { useMe } from '@/lib/auth';
import {
  TOOL_GROUPS,
  type ToolGroup,
  type ToolModule,
  usePatchToolModule,
  useToolModules,
} from '@/lib/tool-modules';

import { ALERT_TEXT, CELL, HEAD, HEAD_ROW, PANEL, ROW, STATE_TEXT } from '../system/modal';
import { loadErrorText, PageHeader, saveErrorText } from '../system/states';
import { ModuleForm } from './module-form';
import { RunModule } from './run-module';

const COUNT = new Intl.NumberFormat('en-US');

/** Recon, Scan, Exploit: docs/appendix/glossary.md. */
const GROUP_LABEL: Readonly<Record<ToolGroup, string>> = {
  recon: 'Recon',
  scan: 'Scan',
  exploit: 'Exploit',
};

const GROUP_TONE: Readonly<Record<ToolGroup, string>> = {
  recon: 'bg-info-soft text-info border-info-bd',
  scan: 'bg-accent-soft text-primary border-accent-soft-bd',
  exploit: 'bg-warn-soft text-warn border-warn-bd',
};

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

  return (
    <div className="flex w-full flex-col gap-space-lg">
      <PageHeader
        section="System"
        current="Modules"
        title="Modules"
        description="One row per tool module. A job runs one tool module; Exploit jobs wait for approval by an Admin who did not create them."
      />

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

      <div className={PANEL}>
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
                                className="h-4 w-4 accent-primary"
                              />
                              <span className="text-body-code text-fg-muted">
                                {m.is_enabled ? 'Enabled' : 'Disabled'}
                              </span>
                            </label>
                          ) : (
                            <span className="text-body-code text-fg-muted">
                              {m.is_enabled ? 'Enabled' : 'Disabled'}
                            </span>
                          )}
                        </td>
                        <td className={`${CELL} text-body-code`}>{m.name}</td>
                        <td className={CELL}>
                          <span
                            className={`rounded-sm border px-space-xs text-body-code ${GROUP_TONE[m.group]}`}
                          >
                            {GROUP_LABEL[m.group]}
                          </span>
                        </td>
                        <td className={`${CELL} text-body-code`}>
                          {COUNT.format(m.max_concurrency)}
                        </td>
                        <td className={`${CELL} text-body-code`}>
                          {m.rate_limit_per_minute === null
                            ? 'No limit'
                            : `${COUNT.format(m.rate_limit_per_minute)} / min`}
                        </td>
                        <td className={`${CELL} text-body-code`}>
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
                              onClick={() => {
                                setCreated(null);
                                setOpen({ mode: 'run', module: m });
                              }}
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
            <div className="border-t border-border bg-surface-2 px-space-md">
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
