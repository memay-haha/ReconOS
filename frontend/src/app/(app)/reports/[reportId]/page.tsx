'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { type FormEvent, type ReactElement, useState } from 'react';

import { MarkdownView } from '@/components/markdown-view';
import { fieldErrorsOf } from '@/lib/api-client';
import { SEVERITY_LABEL, TRIAGE_LABEL } from '@/lib/findings';
import { fieldErrorText } from '@/lib/field-error-text';
import { formatMoment } from '@/lib/format-moment';
import { rawOutputContentHref } from '@/lib/raw-outputs';
import {
  REPORT_EXPORT_FORMATS,
  REPORT_STATUS_LABEL,
  type ReportDetail,
  reportExportHref,
  useDeleteReport,
  usePatchReport,
  useReport,
  useSubmitReport,
} from '@/lib/reports';

import { BADGE, SEVERITY_TONE, TRIAGE_TONE } from '../../findings/tones';
import {
  BUTTON_DANGER,
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  CELL,
  FIELD,
  HEAD,
  HEAD_ROW,
  LABEL,
  PANEL,
  ROW,
  STATE_TEXT,
} from '../../system/modal';
import { loadErrorText, saveErrorText } from '../../system/states';
import { REPORT_STATUS_TONE } from '../tones';

const EXPORT_LABEL = { md: 'Markdown', csv: 'CSV', jsonl: 'JSONL' } as const;

/** A refusal names a field with a machine code; anything else reads as the screen's sentence. */
function errorText(error: unknown): string {
  const codes = Object.values(fieldErrorsOf(error));
  if (codes.includes('not_confirmed')) {
    return 'Every finding in the report must be confirmed. Confirm it again on Findings, or remove it.';
  }
  const first = codes[0];
  return first === undefined ? saveErrorText(error) : fieldErrorText(first);
}

function EditForm({ report }: { report: ReportDetail }): ReactElement {
  const draft = report.status === 'draft';
  const [title, setTitle] = useState(report.title);
  const [body, setBody] = useState(report.body);
  const [ref, setRef] = useState(report.platform_report_ref ?? '');
  const [preview, setPreview] = useState(!draft);
  const [saved, setSaved] = useState(false);
  const patch = usePatchReport(report.id);

  const onSave = (event: FormEvent) => {
    event.preventDefault();
    setSaved(false);
    const platformRef = ref.trim() === '' ? null : ref.trim();
    patch.mutate(
      draft
        ? { title, body, platform_report_ref: platformRef }
        : { platform_report_ref: platformRef },
      {
        onSuccess: () => setSaved(true),
      },
    );
  };

  return (
    <form onSubmit={onSave} className={`${PANEL} flex flex-col gap-space-md p-space-md`}>
      {draft && (
        <label htmlFor="report-title" className={LABEL}>
          Title
          <input
            id="report-title"
            value={title}
            maxLength={255}
            required
            onChange={(e) => setTitle(e.target.value)}
            className={FIELD}
          />
        </label>
      )}
      <label htmlFor="report-ref" className={LABEL}>
        Platform Report ID
        <input
          id="report-ref"
          value={ref}
          maxLength={255}
          placeholder="The report's ID on the bug bounty platform"
          onChange={(e) => setRef(e.target.value)}
          className={FIELD}
        />
      </label>
      <div className="flex flex-col gap-space-xs">
        <div className="flex items-center justify-between gap-space-sm">
          <span className="text-body-default text-fg">Body (Markdown)</span>
          {draft && (
            <div role="group" aria-label="Body view" className="flex gap-1">
              <button
                type="button"
                aria-pressed={!preview}
                onClick={() => setPreview(false)}
                className={BUTTON_SECONDARY}
              >
                Write
              </button>
              <button
                type="button"
                aria-pressed={preview}
                onClick={() => setPreview(true)}
                className={BUTTON_SECONDARY}
              >
                Preview
              </button>
            </div>
          )}
        </div>
        {preview ? (
          <div className="min-h-24 rounded-sm border border-border bg-surface p-space-md">
            {body.trim() === '' ? (
              <p className="text-body-default text-fg-muted">The body is empty.</p>
            ) : (
              <MarkdownView source={body} />
            )}
          </div>
        ) : (
          <>
            <label htmlFor="report-body" className="sr-only">
              Body
            </label>
            <textarea
              id="report-body"
              value={body}
              rows={14}
              onChange={(e) => setBody(e.target.value)}
              className="min-h-48 rounded-sm border border-border bg-surface-2 p-space-md font-body-code text-body-code text-fg focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-space-sm">
        <button type="submit" disabled={patch.isPending} className={BUTTON_PRIMARY}>
          {patch.isPending ? 'Saving…' : 'Save'}
        </button>
        {saved && (
          <p role="status" className="text-body-default text-good">
            Saved.
          </p>
        )}
        {patch.isError && (
          <p role="alert" className="text-body-default text-crit">
            {errorText(patch.error)}
          </p>
        )}
      </div>
    </form>
  );
}

function FindingsPanel({ report }: { report: ReportDetail }): ReactElement {
  const patch = usePatchReport(report.id);
  const draft = report.status === 'draft';
  const remove = (findingId: string) =>
    patch.mutate({
      finding_ids: report.findings.map((f) => f.id).filter((id) => id !== findingId),
    });

  return (
    <section aria-labelledby="report-findings" className={PANEL}>
      <h2
        id="report-findings"
        className="border-b border-border px-space-md py-space-sm text-headline-md text-fg"
      >
        Findings and evidence
      </h2>
      {patch.isError && (
        <p role="alert" className="px-space-md py-space-sm text-body-default text-crit">
          {errorText(patch.error)}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className={HEAD_ROW}>
              <th className={HEAD}>Severity</th>
              <th className={HEAD}>Finding</th>
              <th className={HEAD}>Asset</th>
              <th className={HEAD}>Status</th>
              <th className={HEAD}>Evidence</th>
              {draft && <th className={HEAD}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {report.findings.map((f) => (
              <tr key={f.id} className={ROW}>
                <td className={CELL}>
                  <span className={`${BADGE} ${SEVERITY_TONE[f.severity]}`}>
                    {SEVERITY_LABEL[f.severity]}
                  </span>
                </td>
                <td className={`${CELL} whitespace-normal`}>
                  {/* Text from raw output: rendered as text, never as HTML. */}
                  <span className="block font-semibold">{f.name}</span>
                  {f.matched_at !== null && (
                    <span className="block break-all font-body-code text-caption text-fg-muted">
                      {f.matched_at}
                    </span>
                  )}
                </td>
                <td className={`${CELL} break-all font-body-code`}>{f.asset.name}</td>
                <td className={CELL}>
                  <span className={`${BADGE} ${TRIAGE_TONE[f.triage_status]}`}>
                    {TRIAGE_LABEL[f.triage_status]}
                  </span>
                </td>
                <td className={CELL}>
                  {f.raw_output === null ? (
                    <span className="text-fg-muted">Raw output gone</span>
                  ) : (
                    <>
                      <a
                        href={rawOutputContentHref(f.raw_output.id)}
                        download
                        className="font-body-code text-primary hover:underline"
                      >
                        {f.raw_output.filename}
                      </a>
                      <span
                        className="block font-body-code text-caption text-fg-muted"
                        title={f.raw_output.sha256}
                      >
                        SHA-256 {f.raw_output.sha256.slice(0, 12)}…
                      </span>
                    </>
                  )}
                </td>
                {draft && (
                  <td className={CELL}>
                    <button
                      type="button"
                      onClick={() => remove(f.id)}
                      disabled={patch.isPending || report.findings.length <= 1}
                      aria-label={`Remove ${f.name} from the report`}
                      className={BUTTON_SECONDARY}
                    >
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SubmitPanel({ report }: { report: ReportDetail }): ReactElement {
  const router = useRouter();
  const submit = useSubmitReport(report.id);
  const del = useDeleteReport(report.id);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className={`${PANEL} flex flex-col gap-space-sm p-space-md`}>
      <p className="text-body-default text-fg-muted">
        Submit after filing the report on the platform. Every finding in it moves to Reported, and
        the report then keeps only its platform report ID editable.
      </p>
      <div className="flex flex-wrap gap-space-sm">
        <button
          type="button"
          onClick={() => submit.mutate(report.platform_report_ref)}
          disabled={submit.isPending}
          className={BUTTON_PRIMARY}
        >
          {submit.isPending ? 'Submitting…' : 'Mark Submitted'}
        </button>
        {confirmDelete ? (
          <button
            type="button"
            onClick={() => del.mutate(undefined, { onSuccess: () => router.push('/reports') })}
            disabled={del.isPending}
            className={BUTTON_DANGER}
          >
            Confirm Delete
          </button>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} className={BUTTON_SECONDARY}>
            Delete Draft
          </button>
        )}
      </div>
      {submit.isError && (
        <p role="alert" className="text-body-default text-crit">
          {errorText(submit.error)} No finding was changed.
        </p>
      )}
      {del.isError && (
        <p role="alert" className="text-body-default text-crit">
          {errorText(del.error)}
        </p>
      )}
    </div>
  );
}

export default function ReportDetailPage(): ReactElement {
  const params = useParams<{ reportId: string }>();
  const report = useReport(params.reportId);

  if (report.isPending) return <p className={STATE_TEXT}>Loading the report…</p>;
  if (report.isError) {
    return (
      <p role="alert" className="text-body-default text-crit">
        {loadErrorText(report.error, 'report')}
      </p>
    );
  }
  const r = report.data;
  return (
    <div className="flex w-full flex-col gap-space-lg">
      <div className="flex flex-col justify-between gap-space-md pt-space-xs lg:flex-row lg:items-end">
        <div className="flex flex-col gap-space-xs">
          <div className="flex items-center gap-space-sm text-caption text-fg-faint">
            <Link href="/reports" className="hover:text-primary">
              Reports
            </Link>
            <span aria-hidden="true">/</span>
            <span className="font-body-code text-body-code text-primary">{r.program_name}</span>
          </div>
          <h1 className="flex flex-wrap items-center gap-space-sm text-headline-lg text-fg">
            <span className="break-all">{r.title}</span>
            <span className={`${BADGE} ${REPORT_STATUS_TONE[r.status]}`}>
              {REPORT_STATUS_LABEL[r.status]}
            </span>
          </h1>
          <p className="text-body-default text-fg-muted">
            Created {formatMoment(r.created_at)}
            {r.created_by_username !== null && ` by ${r.created_by_username}`}
            {r.submitted_at !== null && `. Submitted ${formatMoment(r.submitted_at)}`}
          </p>
        </div>
        <div role="group" aria-label="Export" className="flex flex-wrap gap-space-xs">
          {REPORT_EXPORT_FORMATS.map((format) => (
            <a
              key={format}
              href={reportExportHref(r.id, format)}
              download
              className={`${BUTTON_SECONDARY} inline-flex items-center gap-1`}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-icon">
                file_download
              </span>
              {EXPORT_LABEL[format]}
            </a>
          ))}
        </div>
      </div>

      {r.status === 'draft' && <SubmitPanel report={r} />}
      {/* Keyed on updated_at so the form starts again from what the server saved. */}
      <EditForm key={r.updated_at} report={r} />
      <FindingsPanel report={r} />
    </div>
  );
}
