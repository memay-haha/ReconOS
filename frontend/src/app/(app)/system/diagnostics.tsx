'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import { ApiError } from '@/lib/api-client';
import {
  type DiagnosticRun,
  diagnosticKeys,
  useDiagnostic,
  useLatestDiagnostic,
} from '@/lib/diagnostics';
import { formatAgo } from '@/lib/format-ago';
import { formatMoment } from '@/lib/format-moment';

import { BUTTON_PRIMARY, BUTTON_SECONDARY, Modal } from './modal';

type LineKind = 'warn' | 'fail' | 'ok' | 'info' | 'plain';

/** Kind of a console line by its leading tag, as the mockup's console prints them. */
function lineKind(line: string): LineKind {
  if (/^\[(WARN|!)\]/.test(line)) return 'warn';
  if (/^\[(FAIL|ERROR|ERR)\]/.test(line)) return 'fail';
  if (/^\[OK\]/.test(line)) return 'ok';
  if (/^\[\*\]/.test(line)) return 'info';
  return 'plain';
}

const LINE_TONE: Readonly<Record<LineKind, string>> = {
  warn: 'text-warn',
  fail: 'text-crit',
  ok: 'text-good',
  info: 'text-fg-faint',
  plain: 'text-fg-muted',
};

function statusText(run: DiagnosticRun): string {
  if (run.status === 'running') return 'Running…';
  return run.status === 'passed' ? 'All checks passed' : 'Some checks failed';
}

/** "Last diagnostic: 14m ago | All checks passed | View Diagnostics Log". Paths OK is out:
 * a run carries no path (docs/data/schema.md). */
export function DiagnosticBanner({
  enabled,
  onView,
}: {
  enabled: boolean;
  onView: (id: string) => void;
}): ReactElement | null {
  const latest = useLatestDiagnostic(enabled);
  // No run yet answers 404: the banner says so instead of an error.
  const none = latest.error instanceof ApiError && latest.error.status === 404;
  if (latest.isPending && enabled) return null;
  const run = latest.data;
  const failed = run?.status === 'failed';
  return (
    <div
      className={`flex flex-col justify-between gap-space-sm rounded-sm border-y border-r border-l-4 border-border bg-surface-2 p-space-sm sm:flex-row sm:items-center sm:px-space-md sm:py-2.5 ${failed ? 'border-l-warn' : 'border-l-good'}`}
    >
      <div className="flex items-start gap-2 sm:items-center">
        <span
          aria-hidden="true"
          className={`material-symbols-outlined mt-0.5 shrink-0 text-[18px] sm:mt-0 ${failed ? 'text-warn' : 'text-good'}`}
        >
          {failed ? 'warning' : 'verified'}
        </span>
        <p className="font-body-code text-[12px] leading-tight text-fg">
          <span className="text-fg-faint">Last diagnostic:</span>{' '}
          {run === undefined ? (
            <span className="text-fg-muted">
              {none ? 'never run' : latest.isError ? 'could not be read' : 'unknown'}
            </span>
          ) : (
            <>
              <span className="text-fg-muted" title={formatMoment(run.created_at)}>
                {formatAgo(run.created_at)}
              </span>
              <span aria-hidden="true" className="mx-1.5 hidden text-fg-faint sm:inline">
                |
              </span>
              <span className={failed ? 'text-warn' : 'text-good'}>{statusText(run)}</span>
              {run.exit_code !== null && (
                <>
                  <span aria-hidden="true" className="mx-1.5 hidden text-fg-faint sm:inline">
                    |
                  </span>
                  <span className="text-fg-muted">exit code {run.exit_code}</span>
                </>
              )}
            </>
          )}
        </p>
      </div>
      {run !== undefined && (
        <button
          type="button"
          onClick={() => onView(run.id)}
          className="flex shrink-0 items-center gap-1 self-start font-label-caps text-caption uppercase tracking-wider text-primary underline hover:no-underline sm:self-auto"
        >
          <span>View Diagnostics Log</span>
          <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
            open_in_new
          </span>
        </button>
      )}
    </div>
  );
}

/** Downloads the run as JSON. Built in the browser from the run already on screen. */
function exportRun(run: DiagnosticRun): void {
  const blob = new Blob([JSON.stringify(run, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `diagnostic-${run.id}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function DiagnosticsDialog({
  runId,
  onClose,
}: {
  runId: string;
  onClose: () => void;
}): ReactElement {
  const client = useQueryClient();
  const run = useDiagnostic(runId);
  const data = run.data;
  const close = () => {
    // A finished run is now the latest one: the banner reads it again.
    void client.invalidateQueries({ queryKey: diagnosticKeys.latest });
    onClose();
  };
  const lines = (data?.output ?? '')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((text) => ({ text, kind: lineKind(text) }));

  return (
    <Modal title="System Diagnostics Console Output" busy={false} wide onClose={close}>
      <div className="flex flex-col gap-space-md">
        <div
          role="log"
          aria-label="Diagnostic output"
          className="max-h-[60vh] space-y-1 overflow-y-auto rounded-sm bg-surface-container-lowest p-space-md font-body-code text-[12px] leading-relaxed text-fg"
        >
          {run.isPending && <p className="text-fg-muted">Starting the diagnostic…</p>}
          {run.isError && <p className="text-crit">Could not read the diagnostic run.</p>}
          {lines.map(({ text, kind }, i) => (
            // Plain text from the backend, one check per line; never parsed as markup.
            <p key={i} className={LINE_TONE[kind]}>
              {text}
            </p>
          ))}
          {data?.status === 'running' && <p className="text-fg-faint">Running…</p>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-space-sm">
          <span className="font-body-code text-caption text-fg-faint">
            {data === undefined || data.exit_code === null
              ? 'Exit code: pending'
              : `Exit code: ${data.exit_code}`}
          </span>
          <div className="flex items-center gap-space-sm">
            <button type="button" onClick={close} className={BUTTON_SECONDARY}>
              Close
            </button>
            <button
              type="button"
              disabled={data === undefined || data.status === 'running'}
              onClick={() => {
                if (data !== undefined) exportRun(data);
              }}
              className={`${BUTTON_PRIMARY} inline-flex items-center gap-1`}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                file_download
              </span>
              Export Report (.json)
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
