import type { ReactElement } from 'react';

import { formatAgo } from '@/lib/format-ago';
import { formatMoment } from '@/lib/format-moment';
import type { ToolModuleRow } from '@/lib/tool-modules';

import { counterText, engineName, outputContract, primaryEngine } from './module-bits';
import {
  ENGINE_STATUS_DOT,
  ENGINE_STATUS_LABEL,
  GROUP_DOT,
  GROUP_LABEL,
  GROUP_TONE,
  OUTPUT_ICON,
  REASON_LABEL,
  SWITCH_INPUT,
} from './tones';

const CARD_ON =
  'flex flex-col justify-between rounded-sm border border-border bg-surface p-space-lg hover:border-border-strong';
// A disabled tool module fades, as the mockup's idle OAST card does, so the enabled ones lead.
const CARD_OFF = `${CARD_ON} opacity-70`;

const FOOT_BUTTON =
  'inline-flex items-center gap-1 rounded-sm border border-transparent px-2.5 py-1 font-body-code text-body-code text-fg-muted hover:border-border hover:bg-surface-2 hover:text-fg focus:outline-none focus:ring-2 focus:ring-ring';
const RUN_BUTTON =
  'inline-flex items-center gap-1 rounded-sm border border-accent-soft-bd bg-accent-soft px-2.5 py-1 font-body-code text-body-code font-semibold text-primary hover:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60';
const ENABLE_BUTTON =
  'inline-flex items-center gap-1 rounded-sm border border-good-bd px-2.5 py-1 font-body-code text-body-code font-semibold text-good hover:bg-good-soft focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60';

function Spec({ label, children }: { label: string; children: ReactElement }): ReactElement {
  return (
    <div className="flex items-center justify-between gap-space-sm text-caption">
      <dt className="text-label-caps uppercase text-fg-faint">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function Icon({ name }: { name: string }): ReactElement {
  return (
    <span aria-hidden="true" className="material-symbols-outlined text-icon">
      {name}
    </span>
  );
}

/** The card grid of S18, one card per tool module. Same actions as the table view. */
export function ModuleCards({
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
    <ul className="grid grid-cols-1 gap-space-md md:grid-cols-2 2xl:grid-cols-3">
      {modules.map((m) => (
        <li key={m.id} className={m.is_enabled ? CARD_ON : CARD_OFF}>
          <div>
            <div className="mb-space-sm flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-label-caps uppercase ${GROUP_TONE[m.group]}`}
                >
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 rounded-full ${GROUP_DOT[m.group]}`}
                  />
                  {GROUP_LABEL[m.group]}
                </span>
                <span className="rounded-sm border border-border bg-surface-2 px-1.5 py-0.5 font-body-code text-body-code text-primary">
                  {m.name}
                </span>
              </div>
              {isSuperadmin ? (
                <input
                  type="checkbox"
                  role="switch"
                  checked={m.is_enabled}
                  disabled={busy}
                  onChange={() => onToggle(m)}
                  aria-label={`Enable ${m.name}`}
                  title="Enable or disable the tool module"
                  className={SWITCH_INPUT}
                />
              ) : (
                <span className="font-body-code text-caption text-fg-muted">
                  {m.is_enabled ? 'Enabled' : 'Disabled'}
                </span>
              )}
            </div>
            <h3
              className={
                m.is_enabled
                  ? 'text-panel-title font-semibold text-fg'
                  : 'text-panel-title font-semibold text-fg-muted'
              }
            >
              {m.title}
            </h3>
            <p className="mb-space-md mt-0.5 text-body-default text-fg-muted">{m.description}</p>
            {m.disabled_reason !== null && (
              <div className="mb-space-md flex items-center gap-1.5 rounded-sm border border-warn-bd bg-warn-soft px-2.5 py-1.5 font-body-code text-caption text-warn">
                <Icon name="warning" />
                <span className="truncate">{REASON_LABEL[m.disabled_reason]}</span>
              </div>
            )}
            {m.runs_on !== null && m.engine_status !== null && (
              <div className="mb-space-md flex items-center gap-1.5 rounded-sm border border-border bg-surface-2 px-2 py-1 font-body-code text-caption text-fg-muted">
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${ENGINE_STATUS_DOT[m.engine_status]}`}
                />
                <span className="truncate">
                  Requires {engineName(m.runs_on)} • {ENGINE_STATUS_LABEL[m.engine_status]}
                </span>
              </div>
            )}
            <dl className="mb-space-md flex flex-col gap-2 rounded-sm border border-border bg-surface-2/60 p-2.5">
              <Spec label="Primary Engine:">
                <span className="flex items-center gap-1 rounded-sm border border-accent-soft-bd bg-accent-soft px-1.5 py-0.5 font-body-code text-caption font-semibold text-primary">
                  <Icon name={m.runs_on === null ? 'terminal' : 'hub'} />
                  {primaryEngine(m)}
                </span>
              </Spec>
              <Spec label="Target Output:">
                <span className="flex items-center gap-1 font-body-code text-caption text-fg">
                  <Icon name={OUTPUT_ICON[m.output_types[0] ?? ''] ?? 'description'} />
                  {outputContract(m)}
                </span>
              </Spec>
            </dl>
            <div className="mb-space-md flex items-center justify-between border-t border-border pt-2 text-caption text-fg-faint">
              {m.last_job_at === null ? (
                <span className="flex items-center gap-1">
                  <Icon name="schedule" />
                  No completed job
                </span>
              ) : (
                <span className="flex items-center gap-1" title={formatMoment(m.last_job_at)}>
                  <Icon name="schedule" />
                  {formatAgo(m.last_job_at)}
                </span>
              )}
              <span className="font-body-code text-fg-muted">{counterText(m)}</span>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-border pt-space-xs">
            {isSuperadmin ? (
              <button
                type="button"
                aria-label={`Configure ${m.name}`}
                onClick={() => onConfigure(m)}
                className={FOOT_BUTTON}
              >
                <Icon name="tune" />
                Configure
              </button>
            ) : (
              <span />
            )}
            {!m.is_enabled && isSuperadmin ? (
              <button
                type="button"
                aria-label={`Enable ${m.name} now`}
                disabled={busy}
                onClick={() => onToggle(m)}
                className={ENABLE_BUTTON}
              >
                <Icon name="power_settings_new" />
                Enable
              </button>
            ) : (
              <button
                type="button"
                aria-label={`Run ${m.name}`}
                disabled={!m.is_enabled}
                onClick={() => onRun(m)}
                className={RUN_BUTTON}
              >
                <Icon name="play_arrow" />
                Run now
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
