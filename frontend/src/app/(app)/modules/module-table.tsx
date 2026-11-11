import type { ReactElement } from 'react';

import type { ToolModuleRow } from '@/lib/tool-modules';

import { CELL, HEAD, HEAD_ROW, ROW } from '../system/modal';
import { outputContract, primaryEngine } from './module-bits';
import { GROUP_LABEL, GROUP_TONE, type ModuleState, REASON_LABEL, STATE_DOT } from './tones';

const COUNT = new Intl.NumberFormat('en-US');

const LINK_BUTTON =
  'rounded-sm px-1 font-body-code text-caption focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60';

function stateOf(m: ToolModuleRow): ModuleState {
  if (!m.is_enabled) return 'off';
  return m.disabled_reason === null ? 'ready' : 'held';
}

function statusText(m: ToolModuleRow): string {
  return m.disabled_reason === null ? 'Ready' : REASON_LABEL[m.disabled_reason];
}

/** The Table view of S18: the mockup's columns plus the limits Configure edits (N47). */
export function ModuleTable({
  modules,
  isSuperadmin,
  busy,
  onToggle,
  onConfigure,
  onRun,
}: {
  modules: readonly ToolModuleRow[];
  isSuperadmin: boolean;
  busy: boolean;
  onToggle: (m: ToolModuleRow) => void;
  onConfigure: (m: ToolModuleRow) => void;
  onRun: (m: ToolModuleRow) => void;
}): ReactElement {
  return (
    <div className="w-full overflow-x-auto" tabIndex={0}>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className={HEAD_ROW}>
            {[
              'Status',
              'Tool Module',
              'Capability',
              'Group',
              'Primary Engine',
              'Output Contract',
              '24h Jobs',
              'Concurrency',
              'Rate limit',
              'Timeout',
            ].map((label) => (
              <th key={label} scope="col" className={HEAD}>
                {label}
              </th>
            ))}
            <th scope="col" className={`${HEAD} text-right`}>
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {modules.map((m) => {
            const state = stateOf(m);
            return (
              <tr key={m.id} className={`${ROW} hover:bg-surface-3`}>
                <td className={CELL}>
                  <span
                    role="img"
                    aria-label={statusText(m)}
                    title={statusText(m)}
                    className={`inline-block h-2 w-2 rounded-full ${STATE_DOT[state]}`}
                  />
                </td>
                <td className={`${CELL} font-body-code text-body-code text-primary`}>{m.name}</td>
                <td className={`${CELL} font-semibold`}>{m.title}</td>
                <td className={CELL}>
                  <span
                    className={`rounded-sm border px-1.5 py-0.5 text-label-caps uppercase ${GROUP_TONE[m.group]}`}
                  >
                    {GROUP_LABEL[m.group]}
                  </span>
                </td>
                <td className={`${CELL} font-body-code text-body-code`}>{primaryEngine(m)}</td>
                <td className={`${CELL} font-body-code text-body-code text-fg-muted`}>
                  {outputContract(m)}
                </td>
                <td className={`${CELL} font-body-code text-body-code text-fg-muted`}>
                  {COUNT.format(m.jobs_24h)}
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
                <td className={`${CELL} text-right`}>
                  <span className="inline-flex items-center gap-space-xs">
                    {isSuperadmin && (
                      <button
                        type="button"
                        aria-label={`Configure ${m.name}`}
                        onClick={() => onConfigure(m)}
                        className={`${LINK_BUTTON} text-primary hover:underline`}
                      >
                        Configure
                      </button>
                    )}
                    {!m.is_enabled && isSuperadmin ? (
                      <button
                        type="button"
                        aria-label={`Enable ${m.name} now`}
                        disabled={busy}
                        onClick={() => onToggle(m)}
                        className={`${LINK_BUTTON} text-good hover:underline`}
                      >
                        Enable
                      </button>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Run ${m.name}`}
                        disabled={!m.is_enabled}
                        onClick={() => onRun(m)}
                        className={`${LINK_BUTTON} text-fg-muted hover:text-fg`}
                      >
                        Run
                      </button>
                    )}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
