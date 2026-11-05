'use client';

import type { ReactElement } from 'react';

import { Pagination, useCursorStack } from '@/components/pagination';
import { formatMoment } from '@/lib/format-moment';
import { useJobLogs } from '@/lib/job-logs';
import { PARSE_STATUS_LABEL, rawOutputContentHref, useJobRawOutputs } from '@/lib/raw-outputs';

import { errorText } from '../programs/error-text';
import { shortId } from '../programs/links';
import { ALERT, COUNT, NOTE, PANEL, ROW_BUTTON, TD, TH } from '../programs/ui';

function size(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${COUNT.format(bytes)} B`;
}

function RawOutputs({ jobId }: { jobId: string }): ReactElement {
  const { cursor, canGoBack, goNext, goBack } = useCursorStack();
  const outputs = useJobRawOutputs(jobId, cursor);
  if (outputs.isPending) return <p className={NOTE}>Loading raw outputs…</p>;
  if (outputs.isError) {
    return (
      <p role="alert" className={ALERT}>
        {errorText(outputs.error, 'Could not load the raw outputs of this job.')}
      </p>
    );
  }
  return (
    <>
      {outputs.data.items.length === 0 ? (
        <p className={NOTE}>This job has no raw output yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse">
            <thead className="border-b border-border bg-surface-2">
              <tr>
                <th className={TH}>File</th>
                <th className={TH}>Size</th>
                <th className={TH}>Parse status</th>
                <th className={TH}>Stored</th>
                <th className={TH}>Download</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {outputs.data.items.map((o) => (
                <tr key={o.id}>
                  <td className={`${TD} break-all font-body-code`}>{o.filename}</td>
                  <td className={TD}>{size(o.size_bytes)}</td>
                  <td className={TD}>
                    {PARSE_STATUS_LABEL[o.parse_status]}
                    {o.parse_error !== null && (
                      <span className="block text-caption text-fg-muted">{o.parse_error}</span>
                    )}
                  </td>
                  <td className={TD}>{formatMoment(o.created_at)}</td>
                  <td className={TD}>
                    <a
                      href={rawOutputContentHref(o.id)}
                      download
                      aria-label={`Download ${o.filename}`}
                      className={ROW_BUTTON}
                    >
                      Download
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination
        label="Raw output pagination"
        page={{
          total: outputs.data.total,
          totalIsEstimate: outputs.data.total_is_estimate,
          nextCursor: outputs.data.next_cursor,
        }}
        canGoBack={canGoBack}
        onBack={goBack}
        onNext={() => goNext(outputs.data.next_cursor)}
      />
    </>
  );
}

function Logs({ jobId }: { jobId: string }): ReactElement {
  const { cursor, canGoBack, goNext, goBack } = useCursorStack();
  const logs = useJobLogs(jobId, cursor);
  if (logs.isPending) return <p className={NOTE}>Loading logs…</p>;
  if (logs.isError) {
    return (
      <p role="alert" className={ALERT}>
        {errorText(logs.error, 'Could not load the logs of this job.')}
      </p>
    );
  }
  return (
    <>
      {logs.data.items.length === 0 ? (
        <p className={NOTE}>No log entries for this job.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-border font-body-code text-body-code">
          {logs.data.items.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-col gap-0.5 py-space-xs sm:flex-row sm:gap-space-md"
            >
              <span className="shrink-0 text-fg-faint">{formatMoment(entry.logged_at)}</span>
              <span className="shrink-0 uppercase text-fg-muted">{entry.level}</span>
              <span className="shrink-0 text-fg-muted">{entry.service}</span>
              {/* Context is data from tools and targets: text only, never markup. */}
              <span className="break-all text-fg">
                {entry.event}
                {Object.keys(entry.context).length > 0 && ` ${JSON.stringify(entry.context)}`}
              </span>
            </li>
          ))}
        </ol>
      )}
      <Pagination
        label="Job log pagination"
        page={{
          total: logs.data.total,
          totalIsEstimate: logs.data.total_is_estimate,
          nextCursor: logs.data.next_cursor,
        }}
        canGoBack={canGoBack}
        onBack={goBack}
        onNext={() => goNext(logs.data.next_cursor)}
      />
    </>
  );
}

/** The raw outputs or the logs of the job the reader picked in the table. */
export function JobDetail({
  jobId,
  view,
  onClose,
}: {
  jobId: string;
  view: 'raw' | 'logs';
  onClose: () => void;
}): ReactElement {
  return (
    <section
      aria-label={view === 'raw' ? 'Raw outputs' : 'Logs'}
      className={`${PANEL} flex flex-col gap-space-md p-space-md`}
    >
      <div className="flex items-center justify-between gap-space-sm">
        <h2 className="font-panel-title text-panel-title text-fg">
          {view === 'raw' ? 'Raw outputs' : 'Logs'} of job{' '}
          <span className="font-body-code" title={jobId}>
            {shortId(jobId)}
          </span>
        </h2>
        <button type="button" onClick={onClose} className={ROW_BUTTON}>
          Close
        </button>
      </div>
      {view === 'raw' ? (
        <RawOutputs key={jobId} jobId={jobId} />
      ) : (
        <Logs key={jobId} jobId={jobId} />
      )}
    </section>
  );
}
