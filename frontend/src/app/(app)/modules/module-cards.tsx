import type { ReactElement } from 'react';

import { formatMoment } from '@/lib/format-moment';
import type { ToolModule } from '@/lib/tool-modules';

import { GROUP_DOT, GROUP_LABEL, GROUP_TONE, SWITCH_INPUT } from './tones';

const COUNT = new Intl.NumberFormat('en-US');

const CARD_ON =
  'flex flex-col justify-between rounded-sm border border-border bg-surface p-space-lg hover:border-border-strong';
// A disabled tool module fades, as the mockup's idle OAST card does, so the enabled ones lead.
const CARD_OFF = `${CARD_ON} opacity-70`;

function Spec({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="flex items-center justify-between text-caption">
      <dt className="text-label-caps uppercase text-fg-faint">{label}</dt>
      <dd className="font-body-code text-fg-muted">{value}</dd>
    </div>
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
  modules: readonly ToolModule[];
  isSuperadmin: boolean;
  busy: boolean;
  onToggle: (m: ToolModule) => void;
  onConfigure: (m: ToolModule) => void;
  onRun: (m: ToolModule) => void;
}): ReactElement {
  return (
    <ul className="grid grid-cols-1 gap-space-md md:grid-cols-2 2xl:grid-cols-3">
      {modules.map((m) => (
        <li key={m.id} className={m.is_enabled ? CARD_ON : CARD_OFF}>
          <div>
            <div className="mb-space-sm flex items-start justify-between gap-2">
              <span
                className={`inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-label-caps uppercase ${GROUP_TONE[m.group]}`}
              >
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full ${GROUP_DOT[m.group]}`}
                />
                {GROUP_LABEL[m.group]}
              </span>
              {isSuperadmin ? (
                <label className="inline-flex cursor-pointer items-center gap-space-xs">
                  <span className="font-body-code text-caption text-fg-muted">
                    {m.is_enabled ? 'Enabled' : 'Disabled'}
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={m.is_enabled}
                    disabled={busy}
                    onChange={() => onToggle(m)}
                    aria-label={`Enable ${m.name}`}
                    className={SWITCH_INPUT}
                  />
                </label>
              ) : (
                <span className="font-body-code text-caption text-fg-muted">
                  {m.is_enabled ? 'Enabled' : 'Disabled'}
                </span>
              )}
            </div>
            <p className="font-body-code text-panel-title text-primary">{m.name}</p>
            <dl className="my-space-md flex flex-col gap-2 rounded-sm border border-border bg-surface-2/60 p-2.5">
              <Spec label="Concurrency" value={COUNT.format(m.max_concurrency)} />
              <Spec
                label="Rate limit"
                value={
                  m.rate_limit_per_minute === null
                    ? 'No limit'
                    : `${COUNT.format(m.rate_limit_per_minute)} / min`
                }
              />
              <Spec label="Timeout" value={`${COUNT.format(m.timeout_minutes)} min`} />
            </dl>
            <div className="mb-space-md flex items-center gap-1 border-t border-border pt-2 text-caption text-fg-faint">
              <span aria-hidden="true" className="material-symbols-outlined text-icon">
                schedule
              </span>
              Updated {formatMoment(m.updated_at)}
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-border pt-space-xs">
            {isSuperadmin ? (
              <button
                type="button"
                aria-label={`Configure ${m.name}`}
                onClick={() => onConfigure(m)}
                className="inline-flex items-center gap-1 rounded-sm border border-transparent px-2.5 py-1 font-body-code text-body-code text-fg-muted hover:border-border hover:bg-surface-2 hover:text-fg focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-icon">
                  tune
                </span>
                Configure
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              aria-label={`Run ${m.name}`}
              disabled={!m.is_enabled}
              onClick={() => onRun(m)}
              className="inline-flex items-center gap-1 rounded-sm border border-accent-soft-bd bg-accent-soft px-2.5 py-1 font-body-code text-body-code font-semibold text-primary hover:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-icon">
                play_arrow
              </span>
              Run now
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
