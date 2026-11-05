'use client';

import Link from 'next/link';
import type { ReactElement, ReactNode } from 'react';

import { Pagination, useCursorStack } from '@/components/pagination';
import { useDomainScreenshots, useJobsForTarget } from '@/lib/domain-detail';
import type { DomainDetail } from '@/lib/domains';
import { SEVERITY_LABEL, TRIAGE_LABEL, useFindings } from '@/lib/findings';
import { formatMoment } from '@/lib/format-moment';
import { JOB_STATUS_LABEL } from '@/lib/jobs';
import type { Page } from '@/lib/page';
import type { ToolModule } from '@/lib/tool-modules';

import { CELL, HEAD, HEAD_ROW, SEVERITY_TONE } from '../asset-ui';
import { CopyButton } from './copy-button';

const PANEL = 'overflow-hidden rounded-sm border border-border bg-surface';
const MUTED = CELL + ' text-body-code text-fg-muted';

function States({
  query,
  noun,
  children,
}: {
  query: { isPending: boolean; isError: boolean; data: Page<unknown> | undefined };
  noun: string;
  children: ReactNode;
}): ReactElement {
  if (query.isError)
    return (
      <p role="alert" className="px-space-md py-space-md text-body-default text-crit">
        {`Could not load the ${noun}.`}
      </p>
    );
  if (query.data === undefined)
    return (
      <p className="px-space-md py-space-md text-body-default text-fg-muted">{`Loading ${noun}…`}</p>
    );
  if (query.data.items.length === 0)
    return (
      <p className="px-space-md py-space-md text-body-default text-fg-muted">{`No ${noun} yet.`}</p>
    );
  return <>{children}</>;
}

function Pager({
  label,
  data,
  stack,
}: {
  label: string;
  data: Page<unknown> | undefined;
  stack: ReturnType<typeof useCursorStack>;
}): ReactElement | null {
  if (data === undefined) return null;
  return (
    <div className="border-t border-border bg-surface-2 px-space-md">
      <Pagination
        label={label}
        page={{
          total: data.total,
          totalIsEstimate: data.total_is_estimate,
          nextCursor: data.next_cursor,
        }}
        canGoBack={stack.canGoBack}
        onBack={stack.goBack}
        onNext={() => stack.goNext(data.next_cursor)}
      />
    </div>
  );
}

export function DnsPanel({ domain }: { domain: DomainDetail }): ReactElement {
  return (
    <div className={PANEL + ' flex flex-col gap-space-sm p-space-md'}>
      <p className="text-body-default text-fg">
        {domain.cname === null ? 'No CNAME record.' : `CNAME ${domain.cname}`}
      </p>
      <p className="text-body-default text-fg-muted">
        {domain.is_wildcard ? 'Wildcard domain.' : 'Not a wildcard domain.'}
      </p>
      {domain.ips.length === 0 ? (
        <p className="text-body-default text-fg-muted">No IP addresses.</p>
      ) : (
        <ul className="flex flex-col gap-space-xs">
          {domain.ips.map((ip) => (
            <li
              key={ip}
              className="flex items-center justify-between rounded-sm bg-surface-2 px-space-sm"
            >
              <span className="text-body-code text-fg">{ip}</span>
              <CopyButton value={ip} label={`Copy ${ip}`} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ScreenshotsPanel({ domainId }: { domainId: string }): ReactElement {
  const stack = useCursorStack();
  const shots = useDomainScreenshots(domainId, stack.cursor);
  return (
    <div className={PANEL}>
      <States query={shots} noun="screenshots">
        <ul className="grid grid-cols-1 gap-space-md p-space-md sm:grid-cols-2 xl:grid-cols-3">
          {shots.data?.items.map((s) => (
            <li
              key={s.id}
              className="flex flex-col gap-space-xs rounded-sm border border-border p-space-sm"
            >
              {s.is_failed ? (
                <p className="text-body-default text-crit">
                  {s.error_message ?? 'The capture failed.'}
                </p>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- streamed by the API, not a static asset
                <img
                  src={`/api/v1/screenshots/${encodeURIComponent(s.id)}/image`}
                  alt={`Screenshot of ${s.final_url ?? 'the domain'}`}
                  loading="lazy"
                  className="w-full rounded-sm border border-border"
                />
              )}
              <span className="truncate text-body-default text-fg">{s.title ?? 'No title'}</span>
              <span className="truncate text-body-code text-fg-muted">{s.final_url ?? ''}</span>
              <span className="text-caption text-fg-muted">{formatMoment(s.captured_at)}</span>
              <Link
                href={`/screenshots/${encodeURIComponent(s.id)}`}
                className="text-body-default text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-ring"
              >
                Inspect
              </Link>
            </li>
          ))}
        </ul>
      </States>
      <Pager label="Screenshots pagination" data={shots.data} stack={stack} />
    </div>
  );
}

export function FindingsTab({ domainId }: { domainId: string }): ReactElement {
  const stack = useCursorStack();
  const findings = useFindings({ domainId, limit: 25 }, stack.cursor);
  return (
    <div className={PANEL}>
      <States query={findings} noun="findings">
        <div className="w-full overflow-x-auto" tabIndex={0}>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className={HEAD_ROW}>
                {['Name', 'Severity', 'Triage status', 'Last seen'].map((c) => (
                  <th key={c} scope="col" className={HEAD}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-body-default">
              {findings.data?.items.map((f) => (
                <tr key={f.id} className="text-fg">
                  <td className={CELL}>{f.name}</td>
                  <td className={CELL}>
                    <span
                      className={`rounded-sm border px-space-xs text-body-code ${SEVERITY_TONE[f.severity]}`}
                    >
                      {SEVERITY_LABEL[f.severity]}
                    </span>
                  </td>
                  <td className={MUTED}>{TRIAGE_LABEL[f.triage_status]}</td>
                  <td className={MUTED}>{formatMoment(f.last_seen_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </States>
      <Pager label="Findings pagination" data={findings.data} stack={stack} />
    </div>
  );
}

export function HistoryTab({
  target,
  toolModules,
}: {
  target: string;
  toolModules: readonly ToolModule[];
}): ReactElement {
  const stack = useCursorStack();
  const jobs = useJobsForTarget(target, stack.cursor);
  const names = new Map(toolModules.map((m) => [m.id, m.name]));
  return (
    <div className={PANEL}>
      <States query={jobs} noun="jobs">
        <div className="w-full overflow-x-auto" tabIndex={0}>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className={HEAD_ROW}>
                {['Job', 'Tool module', 'Status', 'Created', 'Finished'].map((c) => (
                  <th key={c} scope="col" className={HEAD}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-body-default">
              {jobs.data?.items.map((j) => (
                <tr key={j.id} className="text-fg">
                  <td className={CELL + ' text-body-code text-fg'} title={j.id}>
                    {j.id.slice(0, 8)}
                  </td>
                  <td className={MUTED}>
                    {names.get(j.tool_module_id) ?? j.tool_module_id.slice(0, 8)}
                  </td>
                  <td className={MUTED}>{JOB_STATUS_LABEL[j.status]}</td>
                  <td className={MUTED}>{formatMoment(j.created_at)}</td>
                  <td className={MUTED}>
                    {j.finished_at === null ? 'Not finished' : formatMoment(j.finished_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </States>
      <Pager label="Scan history pagination" data={jobs.data} stack={stack} />
    </div>
  );
}
