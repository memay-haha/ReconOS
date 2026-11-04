import type { ReactElement } from 'react';

import { type Finding, SEVERITY_LABEL, TRIAGE_LABEL } from '@/lib/findings';
import { formatMoment } from '@/lib/format-moment';

import { CELL, HEAD, HEAD_ROW } from '../system/modal';
import { BADGE, SEVERITY_TONE, TRIAGE_TONE } from './tones';

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
            <th scope="col" className={HEAD}>
              <input
                type="checkbox"
                checked={all}
                onChange={onToggleAll}
                aria-label="Select every finding on this page"
                className="h-4 w-4 accent-primary"
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
            <th scope="col" className={HEAD}>
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {findings.map((f) => (
            <tr
              key={f.id}
              className={
                openId === f.id
                  ? 'border-b border-border bg-surface-3 text-body-default text-fg'
                  : 'border-b border-border text-body-default text-fg last:border-b-0'
              }
            >
              <td className={CELL}>
                <input
                  type="checkbox"
                  checked={selected.has(f.id)}
                  onChange={() => onToggle(f.id)}
                  aria-label={`Select ${f.name}`}
                  className="h-4 w-4 accent-primary"
                />
              </td>
              <td className={CELL}>
                <span className={`${BADGE} ${SEVERITY_TONE[f.severity]}`}>
                  {SEVERITY_LABEL[f.severity]}
                </span>
              </td>
              <td className="px-space-md py-space-sm">
                <div className="flex flex-col">
                  <span className="text-fg">{f.name}</span>
                  <span className="text-body-code text-fg-muted">
                    {f.template_id ?? 'No template'}
                  </span>
                </div>
              </td>
              <td className="max-w-xs px-space-md py-space-sm">
                {/* Untrusted text from the target: shown as text, never as a link. */}
                <span className="block truncate text-body-code text-fg">
                  {f.matched_at ?? 'Not recorded'}
                </span>
              </td>
              <td className={CELL}>{programName(f.program_id)}</td>
              <td className={CELL}>
                <span className={`${BADGE} ${TRIAGE_TONE[f.triage_status]}`}>
                  {TRIAGE_LABEL[f.triage_status]}
                </span>
              </td>
              <td className={`${CELL} text-body-code text-fg-muted`}>
                {formatMoment(f.first_seen_at)}
              </td>
              <td className={CELL}>
                <button
                  type="button"
                  onClick={() => onOpen(f.id)}
                  aria-label={`Open ${f.name}`}
                  className="rounded-sm border border-border px-space-sm py-space-xs text-body-default text-fg hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  Open
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
