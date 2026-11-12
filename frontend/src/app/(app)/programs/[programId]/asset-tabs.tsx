'use client';

import Link from 'next/link';
import type { ReactElement, ReactNode } from 'react';

import { Pagination, useCursorStack } from '@/components/pagination';
import { useDomains } from '@/lib/domains';
import { SEVERITY_LABEL, useFindings } from '@/lib/findings';
import { formatMoment } from '@/lib/format-moment';
import { useIps } from '@/lib/ips';
import type { Page } from '@/lib/page';
import { useScreenshots } from '@/lib/screenshots';
import { useServices } from '@/lib/services';
import { useUrls } from '@/lib/urls';

import { errorText } from '../error-text';
import { ALERT, NOTE } from '../ui';

/** One asset tab of S09: the program's rows of one list endpoint (`program_id`), 25 a page,
 * and a link to the full screen. Every value is target data, so it renders as text only. */

const LIMIT = 25;

const TH =
  'px-space-md py-2 text-left font-label-caps text-label-caps uppercase tracking-wider text-fg-muted';
const TD = 'px-space-md py-2 align-top text-body-default text-fg';
const CODE = 'px-space-md py-2 align-top break-all font-body-code text-body-code text-fg';
const MUTED =
  'px-space-md py-2 align-top whitespace-nowrap font-body-code text-caption text-fg-muted';

interface ListQuery<T> {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly error: unknown;
  readonly data?: Page<T> | undefined;
}

function AssetTable<T extends { readonly id: string }>({
  title,
  noun,
  query,
  head,
  row,
  fullHref,
  depth,
  canGoBack,
  goBack,
  goNext,
}: {
  title: string;
  noun: string;
  query: ListQuery<T>;
  head: readonly string[];
  row: (item: T) => ReactNode;
  fullHref: string;
  depth: number;
  canGoBack: boolean;
  goBack: () => void;
  goNext: (next: string | null) => void;
}): ReactElement {
  return (
    <section aria-label={title} className="flex flex-col rounded-sm bg-surface shadow-sm">
      <div className="flex items-center justify-between gap-2 p-space-md">
        <h2 className="font-panel-title text-panel-title text-fg">{title}</h2>
        <Link href={fullHref} className="text-caption font-medium text-primary hover:underline">
          Open full list →
        </Link>
      </div>
      {query.isPending && <p className={NOTE}>Loading {noun}…</p>}
      {query.isError && (
        <p role="alert" className={ALERT}>
          {errorText(query.error, `Could not load the ${noun}.`)}
        </p>
      )}
      {query.data !== undefined && query.data.items.length === 0 && (
        <p className={NOTE}>No {noun} for this program yet.</p>
      )}
      {query.data !== undefined && query.data.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead className="bg-surface-2">
              <tr>
                {head.map((h) => (
                  <th key={h} className={TH}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-2">
              {query.data.items.map((item) => (
                <tr key={item.id} className="hover:bg-surface-2/60">
                  {row(item)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {query.data !== undefined && (
        <div className="border-t border-surface-2 px-space-md">
          <Pagination
            label={`${title} pagination`}
            page={{
              total: query.data.total,
              totalIsEstimate: query.data.total_is_estimate,
              nextCursor: query.data.next_cursor,
            }}
            shown={query.data.items.length}
            start={depth * LIMIT + 1}
            noun={noun}
            canGoBack={canGoBack}
            onBack={goBack}
            onNext={() => goNext(query.data?.next_cursor ?? null)}
          />
        </div>
      )}
    </section>
  );
}

export type AssetTab = 'domains' | 'ips' | 'urls' | 'services' | 'screenshots' | 'findings';

function DomainsTab({ programId }: { programId: string }): ReactElement {
  const pager = useCursorStack();
  const query = useDomains({ programId, limit: LIMIT }, pager.cursor);
  return (
    <AssetTable
      title="Domains"
      noun="domains"
      query={query}
      head={['Domain', 'DNS', 'URLs', 'Last seen']}
      fullHref={`/domains?program_id=${programId}`}
      depth={pager.depth}
      canGoBack={pager.canGoBack}
      goBack={pager.goBack}
      goNext={pager.goNext}
      row={(d) => (
        <>
          <td className={CODE}>
            <Link href={`/domains/${d.id}`} className="hover:text-primary hover:underline">
              {d.name}
            </Link>
          </td>
          <td className={MUTED}>{d.dns_status}</td>
          <td className={MUTED}>{d.url_count}</td>
          <td className={MUTED}>{formatMoment(d.last_seen_at)}</td>
        </>
      )}
    />
  );
}

function IpsTab({ programId }: { programId: string }): ReactElement {
  const pager = useCursorStack();
  const query = useIps({ programId, limit: LIMIT }, pager.cursor);
  return (
    <AssetTable
      title="IPs"
      noun="IPs"
      query={query}
      head={['Address', 'ASN', 'Organisation', 'Last seen']}
      fullHref={`/monitor?tab=ips&program_id=${programId}`}
      depth={pager.depth}
      canGoBack={pager.canGoBack}
      goBack={pager.goBack}
      goNext={pager.goNext}
      row={(ip) => (
        <>
          <td className={CODE}>{ip.address}</td>
          <td className={MUTED}>{ip.asn === null ? '-' : `AS${ip.asn}`}</td>
          <td className={TD}>{ip.asn_org ?? '-'}</td>
          <td className={MUTED}>{formatMoment(ip.last_seen_at)}</td>
        </>
      )}
    />
  );
}

function UrlsTab({ programId }: { programId: string }): ReactElement {
  const pager = useCursorStack();
  const query = useUrls({ programId, limit: LIMIT }, pager.cursor);
  return (
    <AssetTable
      title="URLs"
      noun="URLs"
      query={query}
      head={['URL', 'Status', 'Title', 'Last seen']}
      fullHref={`/monitor?tab=urls&program_id=${programId}`}
      depth={pager.depth}
      canGoBack={pager.canGoBack}
      goBack={pager.goBack}
      goNext={pager.goNext}
      row={(u) => (
        <>
          <td className={CODE}>{u.url}</td>
          <td className={MUTED}>{u.status_code ?? '-'}</td>
          <td className={TD}>{u.title ?? '-'}</td>
          <td className={MUTED}>{formatMoment(u.last_seen_at)}</td>
        </>
      )}
    />
  );
}

function ServicesTab({ programId }: { programId: string }): ReactElement {
  const pager = useCursorStack();
  const query = useServices({ programId, limit: LIMIT }, pager.cursor);
  return (
    <AssetTable
      title="Services"
      noun="services"
      query={query}
      head={['Port', 'Service', 'Product', 'Last seen']}
      fullHref={`/monitor?tab=services&program_id=${programId}`}
      depth={pager.depth}
      canGoBack={pager.canGoBack}
      goBack={pager.goBack}
      goNext={pager.goNext}
      row={(s) => (
        <>
          <td className={CODE}>
            {s.port}/{s.transport}
          </td>
          <td className={TD}>{s.name ?? '-'}</td>
          <td className={TD}>
            {[s.product, s.version].filter((v) => v !== null).join(' ') || '-'}
          </td>
          <td className={MUTED}>{formatMoment(s.last_seen_at)}</td>
        </>
      )}
    />
  );
}

function ScreenshotsTab({ programId }: { programId: string }): ReactElement {
  const pager = useCursorStack();
  const query = useScreenshots({ programId, limit: LIMIT }, pager.cursor);
  return (
    <AssetTable
      title="Screenshots"
      noun="screenshots"
      query={query}
      head={['Final URL', 'Status', 'Title', 'Captured']}
      fullHref={`/screenshots?program_id=${programId}`}
      depth={pager.depth}
      canGoBack={pager.canGoBack}
      goBack={pager.goBack}
      goNext={pager.goNext}
      row={(s) => (
        <>
          <td className={CODE}>
            <Link href={`/screenshots/${s.id}`} className="hover:text-primary hover:underline">
              {s.final_url ?? '-'}
            </Link>
          </td>
          <td className={MUTED}>{s.is_failed ? 'Failed' : (s.status_code ?? '-')}</td>
          <td className={TD}>{s.title ?? '-'}</td>
          <td className={MUTED}>{formatMoment(s.captured_at)}</td>
        </>
      )}
    />
  );
}

function FindingsTab({ programId }: { programId: string }): ReactElement {
  const pager = useCursorStack();
  const query = useFindings({ programId, limit: LIMIT }, pager.cursor);
  return (
    <AssetTable
      title="Findings"
      noun="findings"
      query={query}
      head={['Finding', 'Severity', 'Matched at', 'Last seen']}
      fullHref={`/findings?program_id=${programId}`}
      depth={pager.depth}
      canGoBack={pager.canGoBack}
      goBack={pager.goBack}
      goNext={pager.goNext}
      row={(f) => (
        <>
          <td className={TD}>{f.name}</td>
          <td className={MUTED}>{SEVERITY_LABEL[f.severity]}</td>
          <td className={CODE}>{f.matched_at ?? '-'}</td>
          <td className={MUTED}>{formatMoment(f.last_seen_at)}</td>
        </>
      )}
    />
  );
}

export function AssetTabPanel({
  tab,
  programId,
}: {
  tab: AssetTab;
  programId: string;
}): ReactElement {
  switch (tab) {
    case 'domains':
      return <DomainsTab programId={programId} />;
    case 'ips':
      return <IpsTab programId={programId} />;
    case 'urls':
      return <UrlsTab programId={programId} />;
    case 'services':
      return <ServicesTab programId={programId} />;
    case 'screenshots':
      return <ScreenshotsTab programId={programId} />;
    case 'findings':
      return <FindingsTab programId={programId} />;
  }
}
