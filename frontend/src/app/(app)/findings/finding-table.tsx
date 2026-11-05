import type { ReactElement } from 'react';

import { type Finding, SEVERITY_LABEL, TRIAGE_LABEL } from '@/lib/findings';
import { formatMoment } from '@/lib/format-moment';

import { CELL, HEAD, HEAD_ROW } from '../system/modal';
import { BADGE, CHIP, SEVERITY_TONE, TRIAGE_DOT, TRIAGE_TONE } from './tones';

export function FindingTable({
  findings,
  programName,
  selected,
  openId,
  onToggle,
  onToggleAll,
  onOpen,
}: {
  findings: readonly Finding[];
  programName: (programId: string) => string;
  selected: ReadonlySet<string>;
  openId: string | null;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onOpen: (id: string) => void;
}): ReactElement {
  const all = findings.length > 0 && findings.every((f) => selected.has(f.id));
  return (
    <div className="w-full overflow-x-auto" tabIndex={0}>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className={HEAD_ROW}>
            <th scope="col" className={`${HEAD} w-9 text-center`}>
              <input
                type="checkbox"
                checked={all}
                onChange={onToggleAll}
                aria-label="Select every finding on this page"
                className="h-3.5 w-3.5 accent-primary"
              />
            </th>
            <th scope="col" className={HEAD}>
              Severity
            </th>
            <th scope="col" className={HEAD}>
              Finding &amp; Template ID
            </th>
            <th scope="col" className={HEAD}>
              Matched At
            </th>
            <th scope="col" className={HEAD}>
              Program
            </th>
            <th scope="col" className={HEAD}>
              Status
            </th>
            <th scope="col" className={HEAD}>
              First Seen
            </th>
            <th scope="col" className={`${HEAD} text-right`}>
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {findings.map((f) => (
            <tr
              key={f.id}
              className={
                openId === f.id || selected.has(f.id)
                  ? 'border-b border-border bg-surface-3 text-body-default text-fg'
                  : 'border-b border-border text-body-default text-fg last:border-b-0 hover:bg-surface-3'
              }
            >
              <td className={`${CELL} text-center`}>
                <input
                  type="checkbox"
                  checked={selected.has(f.id)}
                  onChange={() => onToggle(f.id)}
                  aria-label={`Select ${f.name}`}
                  className="h-3.5 w-3.5 accent-primary"
                />
              </td>
              <td className={CELL}>
                <span className={`${BADGE} ${SEVERITY_TONE[f.severity]}`}>
                  {SEVERITY_LABEL[f.severity]}
                </span>
              </td>
              <td className="px-space-md py-space-sm">
                <div className="flex flex-col gap-0.5">
                  <span className="text-panel-title text-fg">{f.name}</span>
                  <span className="flex flex-wrap items-center gap-1 font-body-code text-caption text-fg-faint">
                    <span className="text-primary">{f.template_id ?? 'No template'}</span>
                    {f.cve.length > 0 && (
                      <>
                        <span aria-hidden="true">•</span>
                        <span>{f.cve.join(', ')}</span>
                      </>
                    )}
                  </span>
                </div>
              </td>
              <td className="max-w-xs px-space-md py-space-sm">
                {/* Untrusted text from the target: shown as text, never as a link. */}
                <span className="block truncate font-body-code text-caption text-info">
                  {f.matched_at ?? 'Not recorded'}
                </span>
              </td>
              <td className={CELL}>
                <span className="rounded-sm border border-border bg-surface-2 px-1.5 py-0.5 font-body-code text-caption text-fg-muted">
                  {programName(f.program_id)}
                </span>
              </td>
              <td className={CELL}>
                <span className={`${CHIP} ${TRIAGE_TONE[f.triage_status]}`}>
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 rounded-full ${TRIAGE_DOT[f.triage_status]}`}
                  />
                  {TRIAGE_LABEL[f.triage_status]}
                </span>
              </td>
              <td className={`${CELL} font-body-code text-caption text-fg-muted`}>
                {formatMoment(f.first_seen_at)}
              </td>
              <td className={`${CELL} text-right`}>
                <button
                  type="button"
                  onClick={() => onOpen(f.id)}
                  aria-label={`Open ${f.name}`}
                  title="Quick view"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-fg-muted hover:bg-surface-2 hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-icon">
                    visibility
                  </span>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
