'use client';

import { type FormEvent, type ReactElement, useState } from 'react';

import { FieldError } from '@/components/field-error';
import { fieldErrorsOf } from '@/lib/api-client';
import {
  type Finding,
  SEVERITY_LABEL,
  TRIAGE_LABEL,
  TRIAGE_STATUSES,
  type TriageStatus,
  useFinding,
  usePatchFinding,
} from '@/lib/findings';
import { formatMoment } from '@/lib/format-moment';

import { BUTTON_PRIMARY, BUTTON_SECONDARY, FIELD, LABEL } from '../system/modal';
import { loadErrorText, saveErrorText } from '../system/states';
import { BADGE, SEVERITY_TONE } from './tones';

const PRE =
  'max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-sm border border-border bg-surface-2 p-space-sm font-body-code text-body-code text-fg';

function Triage({ finding }: { finding: Finding }): ReactElement {
  const [status, setStatus] = useState<TriageStatus>(finding.triage_status);
  const [original, setOriginal] = useState(finding.duplicate_of_id ?? '');
  const [saved, setSaved] = useState(false);
  const patch = usePatchFinding();
  const fields = fieldErrorsOf(patch.error);
  const general = patch.isError && Object.keys(fields).length === 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSaved(false);
    const duplicate = status === 'duplicate';
    if (duplicate && original.trim() === '') return;
    patch.mutate(
      {
        findingId: finding.id,
        body: { triage_status: status, duplicate_of_id: duplicate ? original.trim() : null },
      },
      { onSuccess: () => setSaved(true) },
    );
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-space-sm">
      <label htmlFor="triage-status" className={LABEL}>
        Triage status
        <select
          id="triage-status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as TriageStatus);
            setSaved(false);
          }}
          className={FIELD}
        >
          {TRIAGE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {TRIAGE_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      <FieldError errors={fields} field="triage_status" />
      {status === 'duplicate' && (
        <>
          <label htmlFor="triage-duplicate-of" className={LABEL}>
            Original finding ID
            <input
              id="triage-duplicate-of"
              required
              value={original}
              onChange={(e) => setOriginal(e.target.value)}
              className={`${FIELD} font-body-code text-body-code`}
            />
          </label>
          <FieldError errors={fields} field="duplicate_of_id" />
        </>
      )}
      {general && (
        <p role="alert" className="text-body-default text-crit">
          {saveErrorText(patch.error)}
        </p>
      )}
      {saved && (
        <p role="status" className="text-body-default text-good">
          Triage saved.
        </p>
      )}
      <div className="flex justify-end">
        <button type="submit" disabled={patch.isPending} className={BUTTON_PRIMARY}>
          {patch.isPending ? 'Saving…' : 'Save triage'}
        </button>
      </div>
    </form>
  );
}

function Fact({ term, children }: { term: string; children: ReactElement | string }): ReactElement {
  return (
    <div className="flex flex-col gap-space-xs">
      <dt className="text-label-caps uppercase text-fg-muted">{term}</dt>
      <dd className="break-all font-body-code text-body-code text-fg">{children}</dd>
    </div>
  );
}

/** Detail panel of one finding. Everything the target sent (matched URL, evidence, detail)
 * is untrusted and shown as text: .claude/rules/security.md. */
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

  return (
    <section
      aria-label="Finding detail"
      className="flex w-full flex-col gap-space-md rounded-sm border border-border bg-surface p-space-md xl:w-[28rem] xl:shrink-0"
    >
      <div className="flex items-start justify-between gap-space-sm">
        <h2 className="text-panel-title text-fg">{f?.name ?? 'Finding'}</h2>
        <button type="button" onClick={onClose} className={BUTTON_SECONDARY}>
          Close
        </button>
      </div>
      {finding.isPending && <p className="text-body-default text-fg-muted">Loading the finding…</p>}
      {finding.isError && (
        <p role="alert" className="text-body-default text-crit">
          {loadErrorText(finding.error, 'finding')}
        </p>
      )}
      {f !== undefined && (
        <>
          <div className="flex flex-wrap items-center gap-space-sm">
            <span className={`${BADGE} ${SEVERITY_TONE[f.severity]}`}>
              {SEVERITY_LABEL[f.severity]}
            </span>
            <span className="font-body-code text-body-code text-fg-muted">{f.id}</span>
          </div>
          <Triage key={`${f.id}:${f.triage_status}`} finding={f} />
          <h3 className="text-label-caps uppercase text-fg-muted">Summary</h3>
          <dl className="grid grid-cols-1 gap-space-sm sm:grid-cols-2">
            <Fact term="Program">{programName(f.program_id)}</Fact>
            <Fact term="Template">{f.template_id ?? 'None'}</Fact>
            <Fact term="Matched at">{f.matched_at ?? 'Not recorded'}</Fact>
            <Fact term="CVE">{f.cve.length === 0 ? 'None' : f.cve.join(', ')}</Fact>
            <Fact term="First seen">{formatMoment(f.first_seen_at)}</Fact>
            <Fact term="Last seen">{formatMoment(f.last_seen_at)}</Fact>
            <Fact term="Job">{f.job_id}</Fact>
            <Fact term="Raw output">
              <a
                href={`/api/v1/raw-outputs/${f.raw_output_id}/content`}
                className="text-primary underline hover:no-underline"
              >
                Download raw output
              </a>
            </Fact>
          </dl>
          <h3 className="text-label-caps uppercase text-fg-muted">Evidence</h3>
          {f.evidence === null || f.evidence === '' ? (
            <p className="text-body-default text-fg-muted">No evidence recorded.</p>
          ) : (
            <pre className={PRE}>{f.evidence}</pre>
          )}
          {f.detail !== null && (
            <>
              <h3 className="text-label-caps uppercase text-fg-muted">Tool detail</h3>
              <pre className={PRE}>{JSON.stringify(f.detail, null, 2)}</pre>
            </>
          )}
        </>
      )}
    </section>
  );
}
