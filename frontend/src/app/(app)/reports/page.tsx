'use client';

import Link from 'next/link';
import { type FormEvent, type ReactElement, useState } from 'react';

import { Pagination, useCursorStack } from '@/components/pagination';
import { formatMoment } from '@/lib/format-moment';
import { usePrograms } from '@/lib/programs';
import {
  REPORT_STATUS_LABEL,
  REPORT_STATUSES,
  type ReportFilter,
  type ReportStatus,
  useReports,
} from '@/lib/reports';

import { BADGE, SELECT } from '../findings/tones';
import { CELL, HEAD, HEAD_ROW, PANEL, ROW, STATE_TEXT } from '../system/modal';
import { loadErrorText, PageHeader } from '../system/states';
import { REPORT_STATUS_TONE } from './tones';

// The contract's default page size (openapi `limit`); the screen sends no limit.
const DEFAULT_LIMIT = 50;
const COUNT = new Intl.NumberFormat('en-US');

// S21 has no mockup yet (tech debt 85): S14's list layout with S20's controls.
export default function ReportsPage(): ReactElement {
  const [draftQ, setDraftQ] = useState('');
  const [programId, setProgramId] = useState('');
  const [status, setStatus] = useState<ReportStatus | ''>('');
  const [filter, setFilter] = useState<ReportFilter>({});
  const { cursor, canGoBack, depth, goNext, goBack, reset } = useCursorStack();
  const programs = usePrograms({ limit: 200 });
  const reports = useReports(filter, cursor);

  const apply = (next: { programId?: string; status?: ReportStatus | ''; q?: string }) => {
    const p = next.programId ?? programId;
    const s = next.status ?? status;
    const q = (next.q ?? draftQ).trim();
    setFilter({ programId: p || null, status: s || null, q: q || null });
    reset();
  };

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    apply({});
  };

  return (
    <div className="flex w-full flex-col gap-space-lg">
      <PageHeader
        title="Reports"
        description="Reports gather confirmed findings of one program with the raw output behind each one. Submitting a report marks its findings reported. Create a report from the selected findings on Findings."
      >
        <Link
          href="/findings?triage_status=confirmed"
          className="inline-flex h-9 items-center gap-2 rounded-sm border border-border-strong bg-surface px-3.5 text-body-default text-fg shadow-sm hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[17px] text-fg-muted">
            pest_control
          </span>
          Confirmed findings
        </Link>
      </PageHeader>

      <form
        onSubmit={onSearch}
        className="flex flex-wrap items-center gap-space-sm rounded-sm border border-border bg-surface p-space-sm"
      >
        <label htmlFor="report-q" className="sr-only">
          Search titles
        </label>
        <input
          id="report-q"
          type="search"
          placeholder="Search titles"
          value={draftQ}
          onChange={(e) => setDraftQ(e.target.value)}
          className={`${SELECT} min-w-48 flex-1`}
        />
        <label htmlFor="report-program" className="sr-only">
          Program
        </label>
        <select
          id="report-program"
          value={programId}
          onChange={(e) => {
            setProgramId(e.target.value);
            apply({ programId: e.target.value });
          }}
          className={SELECT}
        >
          <option value="">All Programs</option>
          {(programs.data?.items ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <label htmlFor="report-status" className="sr-only">
          Status
        </label>
        <select
          id="report-status"
          value={status}
          onChange={(e) => {
            const next = e.target.value as ReportStatus | '';
            setStatus(next);
            apply({ status: next });
          }}
          className={SELECT}
        >
          <option value="">Status: All</option>
          {REPORT_STATUSES.map((s) => (
            <option key={s} value={s}>
              Status: {REPORT_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <button type="submit" className={SELECT}>
          Search
        </button>
      </form>

      <div className={PANEL}>
        {reports.isPending && <p className={STATE_TEXT}>Loading reports…</p>}
        {reports.isError && (
          <p role="alert" className="px-space-md py-space-xl text-body-default text-crit">
            {loadErrorText(reports.error, 'reports')}
          </p>
        )}
        {reports.data !== undefined && reports.data.items.length === 0 && (
          <p className={STATE_TEXT}>
            No reports match. Select confirmed findings on Findings, then Create Report.
          </p>
        )}
        {reports.data !== undefined && reports.data.items.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className={HEAD_ROW}>
                    <th className={HEAD}>Title</th>
                    <th className={HEAD}>Program</th>
                    <th className={HEAD}>Status</th>
                    <th className={HEAD}>Findings</th>
                    <th className={HEAD}>Platform Report</th>
                    <th className={HEAD}>Created</th>
                    <th className={HEAD}>Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.data.items.map((r) => (
                    <tr key={r.id} className={ROW}>
                      <td className={CELL}>
                        <Link
                          href={`/reports/${r.id}`}
                          className="font-semibold text-primary hover:underline"
                        >
                          {r.title}
                        </Link>
                      </td>
                      <td className={CELL}>{r.program_name}</td>
                      <td className={CELL}>
                        <span className={`${BADGE} ${REPORT_STATUS_TONE[r.status]}`}>
                          {REPORT_STATUS_LABEL[r.status]}
                        </span>
                      </td>
                      <td className={`${CELL} font-body-code`}>{COUNT.format(r.finding_count)}</td>
                      <td className={`${CELL} font-body-code`}>{r.platform_report_ref ?? '-'}</td>
                      <td className={CELL}>
                        {formatMoment(r.created_at)}
                        {r.created_by_username !== null && (
                          <span className="block text-caption text-fg-muted">
                            {r.created_by_username}
                          </span>
                        )}
                      </td>
                      <td className={CELL}>
                        {r.submitted_at === null ? '-' : formatMoment(r.submitted_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-border bg-surface-2 px-3.5">
              <Pagination
                label="Reports pagination"
                page={{
                  total: reports.data.total,
                  totalIsEstimate: reports.data.total_is_estimate,
                  nextCursor: reports.data.next_cursor,
                }}
                shown={reports.data.items.length}
                start={depth * DEFAULT_LIMIT + 1}
                noun="reports"
                canGoBack={canGoBack}
                onBack={goBack}
                onNext={() => goNext(reports.data.next_cursor)}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
