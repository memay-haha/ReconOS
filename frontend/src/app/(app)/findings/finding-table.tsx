'use client';

import { type ReactElement, useEffect, useRef, useState } from 'react';

import {
  type FindingAsset,
  type FindingRow,
  SEVERITY_LABEL,
  TRIAGE_LABEL,
  TRIAGE_STATUSES,
  type TriageStatus,
} from '@/lib/findings';
import { formatMoment } from '@/lib/format-moment';

import { CELL, HEAD, HEAD_ROW } from '../system/modal';
import { BADGE, CHIP, ICON_BUTTON, SEVERITY_TONE, TRIAGE_DOT, TRIAGE_TONE } from './tones';

/** `duplicate` needs the original finding, so it is set from the drawer only (N51). */
const MENU_STATUSES = TRIAGE_STATUSES.filter((s) => s !== 'duplicate');

/** "Port: 443 (https) • IP: 198.51.100.24", the second line under the matched target. */
export function assetLine(asset: FindingAsset | null): string | null {
  if (asset === null) return null;
  const parts: string[] = [];
  if (asset.port !== null) {
    parts.push(
      asset.service_name === null
        ? `Port: ${asset.port}`
        : `Port: ${asset.port} (${asset.service_name})`,
    );
  }
  if (asset.ip !== null) parts.push(`IP: ${asset.ip}`);
  return parts.length === 0 ? null : parts.join(' • ');
}

function Icon({ name }: { name: string }): ReactElement {
  return (
    <span aria-hidden="true" className="material-symbols-outlined text-icon">
      {name}
    </span>
  );
}

/** The row's Change Status menu: one PATCH per choice, the backend checks the move. */
function StatusMenu({
  finding,
  busy,
  onChange,
}: {
  finding: FindingRow;
  busy: boolean;
  onChange: (status: TriageStatus) => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === 'Escape'
          : !ref.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        aria-label={`Change status of ${finding.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Change Status"
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
        className={ICON_BUTTON}
      >
        <Icon name="more_vert" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={`Status of ${finding.name}`}
          className="absolute right-0 z-30 mt-1 flex w-40 flex-col rounded-sm border border-border-strong bg-surface py-1 text-left shadow-modal"
        >
          {MENU_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              role="menuitem"
              disabled={s === finding.triage_status}
              onClick={() => {
                setOpen(false);
                onChange(s);
              }}
              className="flex items-center gap-2 px-3 py-1.5 text-body-default text-fg hover:bg-surface-2 disabled:text-fg-faint"
            >
              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${TRIAGE_DOT[s]}`} />
              {TRIAGE_LABEL[s]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function FindingTable({
  findings,
  programName,
  selected,
  openId,
  busy,
  onToggle,
  onToggleAll,
  onOpen,
  onCopy,
  onStatus,
}: {
  findings: readonly FindingRow[];
  programName: (programId: string) => string;
  selected: ReadonlySet<string>;
  openId: string | null;
  busy: boolean;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onOpen: (id: string) => void;
  onCopy: (id: string) => void;
  onStatus: (finding: FindingRow, status: TriageStatus) => void;
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
              Matched At / Target
            </th>
            <th scope="col" className={HEAD}>
              Program
            </th>
            <th scope="col" className={HEAD}>
              Status
            </th>
            <th scope="col" className={HEAD}>
              Matcher / Match
            </th>
            <th scope="col" className={HEAD}>
              Discovered
            </th>
            <th scope="col" className={`${HEAD} text-right`}>
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {findings.map((f) => {
            const second = assetLine(f.asset);
            return (
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
                <td className="min-w-60 px-space-md py-space-sm">
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => onOpen(f.id)}
                      className="text-left text-panel-title font-semibold text-fg hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {f.name}
                    </button>
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
                  {second !== null && (
                    <span className="block font-body-code text-micro text-fg-faint">{second}</span>
                  )}
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
                <td className="max-w-48 px-space-md py-space-sm">
                  <span
                    className="block truncate font-body-code text-caption text-fg-muted"
                    title={f.matcher ?? undefined}
                  >
                    {f.matcher ?? 'Not recorded'}
                  </span>
                  <span className="block font-body-code text-micro text-fg-faint">
                    {f.tool_module_name}
                  </span>
                </td>
                <td className={`${CELL} font-body-code text-caption text-fg-muted`}>
                  {formatMoment(f.first_seen_at)}
                </td>
                <td className={`${CELL} text-right`}>
                  <span className="inline-flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => onOpen(f.id)}
                      aria-label={`Open ${f.name}`}
                      title="Quick View"
                      className={ICON_BUTTON}
                    >
                      <Icon name="visibility" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onCopy(f.id)}
                      aria-label={`Copy ${f.name} as Markdown`}
                      title="Copy Markdown"
                      className={ICON_BUTTON}
                    >
                      <Icon name="content_copy" />
                    </button>
                    <StatusMenu finding={f} busy={busy} onChange={(s) => onStatus(f, s)} />
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
