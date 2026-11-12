'use client';

import Link from 'next/link';
import { type ReactElement, type ReactNode, useEffect, useId, useRef, useState } from 'react';

import { FieldError } from '@/components/field-error';
import { fieldErrorsOf } from '@/lib/api-client';
import {
  type FindingDetail,
  SEVERITY_LABEL,
  TRIAGE_LABEL,
  TRIAGE_STATUSES,
  type TriageStatus,
  useCopyFindingMarkdown,
  useFinding,
  usePatchFinding,
} from '@/lib/findings';
import { formatMoment } from '@/lib/format-moment';

import { BUTTON_PRIMARY, BUTTON_SECONDARY, FIELD } from '../system/modal';
import { loadErrorText, saveErrorText } from '../system/states';
import { FindingTags } from './finding-tags';
import { BADGE, SEVERITY_TONE, TRIAGE_DOT } from './tones';

const FOCUSABLE =
  'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), ' +
  'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

const PRE = 'max-h-72 overflow-auto whitespace-pre-wrap break-all font-body-code text-caption';
const SMALL_BUTTON =
  'inline-flex items-center gap-1 rounded-sm border border-border bg-surface px-2 py-0.5 font-body-code text-caption text-fg-muted hover:bg-surface-2 hover:text-fg focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60';
const STATUS =
  'flex items-center gap-1.5 rounded-sm border px-3 py-1.5 font-body-code text-caption';
const STATUS_OFF = `${STATUS} border-border bg-surface text-fg-muted hover:bg-surface-2 disabled:opacity-50 disabled:hover:bg-surface`;
const STATUS_ON = `${STATUS} border-info-bd bg-info-soft font-semibold text-info ring-2 ring-ring`;

function Icon({ name }: { name: string }): ReactElement {
  return (
    <span aria-hidden="true" className="material-symbols-outlined text-icon">
      {name}
    </span>
  );
}

/** A curl command rebuilt from the recorded raw request: method, URL and headers. The request
 * text is untrusted, so each part is single-quoted for the shell. */
export function curlOf(request: string, matchedAt: string | null): string | null {
  const [first, ...rest] = request.split('\n');
  const parts = /^(\S+)\s+(\S+)/.exec(first ?? '');
  if (parts === null) return null;
  const headers: string[] = [];
  let host = '';
  for (const line of rest) {
    if (line.trim() === '') break;
    const at = line.indexOf(':');
    if (at <= 0) continue;
    const name = line.slice(0, at).trim();
    if (name.toLowerCase() === 'host') host = line.slice(at + 1).trim();
    else headers.push(line.trim());
  }
  const scheme = matchedAt?.startsWith('http://') ? 'http' : 'https';
  const url = /^https?:\/\//.test(parts[2] ?? '')
    ? (parts[2] ?? '')
    : `${scheme}://${host}${parts[2] ?? ''}`;
  const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;
  return [
    `curl -X ${quote(parts[1] ?? 'GET')} ${quote(url)}`,
    ...headers.map((h) => `-H ${quote(h)}`),
  ].join(' \\\n  ');
}

function Meta({ term, children }: { term: string; children: ReactNode }): ReactElement {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-label-caps uppercase tracking-wider text-fg-faint">{term}</dt>
      <dd className="break-all font-body-code text-caption text-fg">{children}</dd>
    </div>
  );
}

function scopeText(f: FindingDetail, program: string): string {
  const where = f.in_scope
    ? `In-Scope${f.scope_rule === null ? '' : `: ${f.scope_rule}`}`
    : 'Out-of-Scope';
  // N50: the asset type stands where the mockup wrote "Web Tier".
  return f.asset === null ? `${program} (${where})` : `${program} (${where} • ${f.asset.type})`;
}

function Body({
  f,
  programName,
  onClose,
  onBusy,
}: {
  f: FindingDetail;
  programName: (programId: string) => string;
  onClose: () => void;
  onBusy: (busy: boolean) => void;
}): ReactElement {
  const [status, setStatus] = useState<TriageStatus>(f.triage_status);
  const [original, setOriginal] = useState(f.duplicate_of_id ?? '');
  const [note, setNote] = useState<string | null>(null);
  const patch = usePatchFinding();
  const copy = useCopyFindingMarkdown();
  const fields = fieldErrorsOf(patch.error);
  const general = patch.isError && Object.keys(fields).length === 0;
  const curl = f.request === null ? null : curlOf(f.request, f.matched_at);
  // The backend names the moves the lifecycle allows; the frontend only greys out the rest.
  const reachable = (s: TriageStatus) =>
    s === f.triage_status || f.allowed_triage_statuses.includes(s);

  useEffect(() => onBusy(patch.isPending), [onBusy, patch.isPending]);

  const save = (next: TriageStatus) => {
    setNote(null);
    const duplicate = next === 'duplicate';
    if (duplicate && original.trim() === '') return;
    patch.mutate(
      {
        findingId: f.id,
        body: { triage_status: next, duplicate_of_id: duplicate ? original.trim() : null },
      },
      { onSuccess: () => setNote('Triage saved.') },
    );
  };

  const copyCurl = () => {
    if (curl === null) return;
    void navigator.clipboard.writeText(curl).then(
      () => setNote('cURL copied.'),
      () => setNote('Could not copy to the clipboard.'),
    );
  };

  return (
    <>
      <div className="flex-1 space-y-space-lg overflow-y-auto p-space-lg">
        <div>
          <p id="triage-status-label" className="mb-2 text-label-caps uppercase text-fg-faint">
            Triage Status &amp; Lifecycle
          </p>
          <div
            role="group"
            aria-labelledby="triage-status-label"
            className="flex flex-wrap items-center gap-2"
          >
            {TRIAGE_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={status === s}
                disabled={!reachable(s)}
                onClick={() => {
                  setStatus(s);
                  setNote(null);
                }}
                className={status === s ? STATUS_ON : STATUS_OFF}
              >
                <span aria-hidden="true" className={`h-2 w-2 rounded-full ${TRIAGE_DOT[s]}`} />
                {TRIAGE_LABEL[s]}
                {s === f.triage_status ? ' (current)' : ''}
              </button>
            ))}
          </div>
          <FieldError errors={fields} field="triage_status" />
          {status === 'duplicate' && (
            <label
              htmlFor="triage-duplicate-of"
              className="mt-space-sm flex flex-col gap-space-xs text-body-default text-fg"
            >
              Original finding ID
              <input
                id="triage-duplicate-of"
                required
                value={original}
                onChange={(e) => setOriginal(e.target.value)}
                className={`${FIELD} font-body-code text-body-code`}
              />
            </label>
          )}
          <FieldError errors={fields} field="duplicate_of_id" />
        </div>

        <dl className="grid grid-cols-1 gap-space-sm rounded-sm border border-border bg-surface-2/60 p-space-md md:grid-cols-2">
          <Meta term="Matched Target URI">
            {/* Untrusted text from the target: shown as text, never as a link. */}
            <span className="font-semibold text-info">{f.matched_at ?? 'Not recorded'}</span>
          </Meta>
          <Meta term="Program & Scope">
            <span className="font-semibold">{scopeText(f, programName(f.program_id))}</span>
          </Meta>
          <Meta term="Detection Matcher">
            <span className="text-primary">{f.matcher ?? 'Not recorded'}</span>
          </Meta>
          <Meta term="Timestamp Discovered">{formatMoment(f.first_seen_at)}</Meta>
          <Meta term="Last Seen">{formatMoment(f.last_seen_at)}</Meta>
          <Meta term="Raw Output">
            {f.raw_output_id === null ? (
              'Deleted'
            ) : (
              <a
                href={`/api/v1/raw-outputs/${encodeURIComponent(f.raw_output_id)}/content`}
                className="text-primary underline hover:no-underline"
              >
                Download raw output
              </a>
            )}
          </Meta>
        </dl>

        <FindingTags f={f} />

        <div>
          <h3 className="mb-1 text-panel-title font-semibold text-fg">Vulnerability Synopsis</h3>
          <p className="whitespace-pre-wrap text-body-default text-fg-muted">
            {f.description ?? 'No description recorded.'}
          </p>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-space-sm">
            <h3 className="text-panel-title font-semibold text-fg">Proof of Concept Telemetry</h3>
            {curl !== null && (
              <button type="button" onClick={copyCurl} className={SMALL_BUTTON}>
                <Icon name="content_copy" />
                Copy cURL
              </button>
            )}
          </div>
          <div className="overflow-x-auto rounded-sm border border-border bg-surface-container-lowest p-3">
            {f.request === null && f.response === null ? (
              <>
                <p className="mb-2 font-body-code text-caption text-fg-faint"># Evidence:</p>
                <pre className={`${PRE} text-fg`}>{f.evidence ?? 'No evidence recorded.'}</pre>
              </>
            ) : (
              <>
                <p className="mb-2 font-body-code text-caption text-fg-faint"># Request:</p>
                <pre className={`${PRE} text-primary`}>{f.request ?? 'Not recorded'}</pre>
                <p className="my-2 border-t border-border pt-2 font-body-code text-caption text-fg-faint">
                  # Response:
                </p>
                <pre className={`${PRE} text-good`}>{f.response ?? 'Not recorded'}</pre>
              </>
            )}
          </div>
        </div>

        <div className="rounded-sm border border-border bg-surface-2/40 p-space-md">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-space-sm">
            <h4 className="flex items-center gap-1.5 text-panel-title font-semibold text-fg">
              <span aria-hidden="true" className="material-symbols-outlined text-icon text-good">
                security
              </span>
              Remediation Guidance
            </h4>
            <button
              type="button"
              disabled={copy.isPending}
              onClick={() =>
                copy.mutate([f.id], {
                  onSuccess: () => setNote('Markdown bug report copied.'),
                  onError: () => setNote('Could not copy the Markdown bug report.'),
                })
              }
              className={SMALL_BUTTON}
            >
              <Icon name="description" />
              Copy as Markdown Bug Report
            </button>
          </div>
          <p className="whitespace-pre-wrap text-caption text-fg-muted">
            {f.remediation ?? 'No remediation recorded.'}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-space-sm border-t border-border bg-surface-2 p-space-md">
        <button type="button" onClick={onClose} className={BUTTON_SECONDARY}>
          Dismiss
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {general && (
            <p role="alert" className="text-body-default text-crit">
              {saveErrorText(patch.error)}
            </p>
          )}
          {note !== null && (
            <p role="status" className="text-body-default text-good">
              {note}
            </p>
          )}
          <button
            type="button"
            disabled={
              patch.isPending ||
              f.triage_status === 'false_positive' ||
              !reachable('false_positive')
            }
            onClick={() => {
              setStatus('false_positive');
              save('false_positive');
            }}
            className={`${BUTTON_SECONDARY} inline-flex items-center gap-1.5`}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-icon text-crit">
              block
            </span>
            Mark False Positive
          </button>
          <button
            type="button"
            disabled={patch.isPending}
            onClick={() => save(status)}
            className={`${BUTTON_PRIMARY} inline-flex items-center gap-1.5`}
          >
            <Icon name="save" />
            {patch.isPending ? 'Saving…' : 'Save Triage Status'}
          </button>
        </div>
      </div>
    </>
  );
}

/** Detail of one finding, as the mockup's inspect dialog draws it. Everything the target sent
 * (matched URL, matcher, request, response, evidence) is untrusted and shown as text:
 * .claude/rules/security.md. */
export function FindingDrawer({
  findingId,
  programName,
  onClose,
}: {
  findingId: string;
  programName: (programId: string) => string;
  onClose: () => void;
}): ReactElement {
  const finding = useFinding(findingId);
  const f = finding.data;
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const opener = document.activeElement;
    ref.current?.focus();
    return () => {
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!busy) onClose();
        return;
      }
      if (event.key !== 'Tab' || ref.current === null) return;
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = items[0];
      const last = items[items.length - 1];
      if (first === undefined || last === undefined) return;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === ref.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [busy, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-space-md backdrop-blur-scrim">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-border-strong bg-surface shadow-modal focus:outline-none"
      >
        <div className="flex items-start justify-between gap-space-md border-b border-border bg-surface-2 p-space-lg">
          <div className="flex min-w-0 items-start gap-space-sm">
            {f !== undefined && (
              <span className={`${BADGE} mt-1 ${SEVERITY_TONE[f.severity]}`}>
                {SEVERITY_LABEL[f.severity]}
              </span>
            )}
            <div className="min-w-0">
              <h2 id={titleId} className="text-headline-lg tracking-tight text-fg">
                {f?.name ?? 'Finding'}
              </h2>
              {f !== undefined && (
                <p className="mt-1 flex flex-wrap items-center gap-2 font-body-code text-caption text-fg-muted">
                  <span>
                    Template: <strong className="text-primary">{f.template_id ?? 'None'}</strong>
                  </span>
                  {f.cve.length > 0 && (
                    <>
                      <span aria-hidden="true">•</span>
                      <span>{f.cve.join(', ')}</span>
                    </>
                  )}
                  <span aria-hidden="true">•</span>
                  <span>
                    Job:{' '}
                    {f.job_id === null ? (
                      'Deleted'
                    ) : (
                      <Link
                        href={`/queue?job=${encodeURIComponent(f.job_id)}`}
                        className="text-info hover:underline"
                        title={f.job_id}
                      >
                        {f.job_id.slice(0, 8)}
                      </Link>
                    )}{' '}
                    ({f.tool_module_name ?? 'unknown tool module'})
                  </span>
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-border bg-surface-3 text-fg-muted hover:bg-surface hover:text-fg focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <Icon name="close" />
          </button>
        </div>
        {finding.isPending && (
          <p className="p-space-lg text-body-default text-fg-muted">Loading the finding…</p>
        )}
        {finding.isError && (
          <p role="alert" className="p-space-lg text-body-default text-crit">
            {loadErrorText(finding.error, 'finding')}
          </p>
        )}
        {f !== undefined && (
          <Body key={f.id} f={f} programName={programName} onClose={onClose} onBusy={setBusy} />
        )}
      </div>
    </div>
  );
}
