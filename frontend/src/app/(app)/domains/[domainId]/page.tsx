'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type KeyboardEvent, type ReactElement, useState } from 'react';

import { ApiError } from '@/lib/api-client';
import { useDiscoveryEvent, useDomainScreenshots, useJob } from '@/lib/domain-detail';
import { useDomain } from '@/lib/domains';
import { SEVERITY_LABEL } from '@/lib/findings';
import { formatMoment } from '@/lib/format-moment';
import { SEVERITIES } from '@/lib/programs';
import { useToolModules } from '@/lib/tool-modules';

import { DnsBadge } from '../asset-bits';
import { BUTTON, copyText, COUNT } from '../asset-ui';
import { RunScanButton } from '../run-scan-button';
import { useProgramOptions } from '../use-program-options';
import { CopyButton } from './copy-button';
import { CapturePanel, EventsPanel, FindingsPanel, TargetPanel } from './overview';
import {
  DnsPanel,
  FindingsTab,
  HistoryTab,
  ScreenshotsPanel,
  ServicesTab,
  UrlsTab,
} from './tab-panels';

type TabId = 'overview' | 'dns' | 'urls' | 'services' | 'screenshots' | 'findings' | 'history';

const TAB =
  'flex items-center gap-space-xs border-b-2 px-space-sm py-space-sm text-body-default focus:outline-none focus:ring-2 focus:ring-ring';
const TAB_ON = TAB + ' border-primary text-fg';
const TAB_OFF = TAB + ' border-transparent text-fg-muted hover:text-fg';

function Tile({
  label,
  icon,
  value,
  note,
}: {
  label: string;
  icon: string;
  value: number | undefined;
  note?: string;
}): ReactElement {
  return (
    <div
      data-stat-tile
      className="flex flex-col gap-space-xs rounded-sm border border-border bg-surface p-space-md"
    >
      <div className="flex items-start justify-between">
        <span className="text-label-caps uppercase text-fg-faint">{label}</span>
        <span aria-hidden="true" className="material-symbols-outlined text-icon text-fg-muted">
          {icon}
        </span>
      </div>
      <div className="text-stat-lg text-fg">
        {value === undefined ? 'Loading…' : COUNT.format(value)}
      </div>
      {note !== undefined && <div className="text-caption text-fg-muted">{note}</div>}
    </div>
  );
}

export default function DomainDetailPage(): ReactElement {
  const params = useParams<{ domainId: string }>();
  const domainId = params.domainId;
  const domain = useDomain(domainId);
  const { nameOf } = useProgramOptions();
  const toolModules = useToolModules();
  const discovery = useDiscoveryEvent(domainId);
  const discoveryJob = useJob(discovery.data?.job_id ?? null);
  const screenshots = useDomainScreenshots(domainId);
  const [tab, setTab] = useState<TabId>('overview');

  const crumbs = (name: string) => (
    <div className="flex items-center justify-between gap-space-sm">
      <div className="flex min-w-0 items-center gap-space-xs text-body-default">
        <Link
          href="/domains"
          className="flex items-center gap-space-xs text-fg-muted hover:text-fg focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-icon">
            arrow_back
          </span>
          <span>Domains</span>
        </Link>
        <span aria-hidden="true" className="text-fg-faint">
          /
        </span>
        <span className="truncate text-body-code text-fg">{name}</span>
      </div>
    </div>
  );

  if (domain.isError) {
    const missing = domain.error instanceof ApiError && domain.error.status === 404;
    return (
      <div className="flex w-full flex-col gap-space-lg">
        {crumbs('Unknown domain')}
        <p role="alert" className="text-body-default text-crit">
          {missing
            ? 'This domain does not exist, or you cannot see it.'
            : 'Could not load the domain.'}
        </p>
      </div>
    );
  }
  if (domain.data === undefined) {
    return (
      <div className="flex w-full flex-col gap-space-lg">
        {crumbs('Loading…')}
        <p className="text-body-default text-fg-muted">Loading the domain…</p>
      </div>
    );
  }

  const d = domain.data;
  const counts = d.finding_counts;
  const findingTotal = SEVERITIES.reduce((n, s) => n + counts[s], 0);
  const highest = SEVERITIES.find((s) => counts[s] > 0);
  const modules = toolModules.data?.items ?? [];
  const toolName =
    discoveryJob.data === undefined
      ? null
      : (modules.find((m) => m.id === discoveryJob.data.tool_module_id)?.name ?? null);
  const programName = nameOf(d.program_id);
  const shotTotal = screenshots.data?.total;

  const tabs: { id: TabId; label: string; count: number | undefined }[] = [
    { id: 'overview', label: 'Overview', count: undefined },
    { id: 'dns', label: 'DNS & IPs', count: d.ips.length },
    { id: 'urls', label: 'URLs', count: d.url_count },
    { id: 'services', label: 'Services', count: d.service_count },
    { id: 'screenshots', label: 'Screenshots', count: shotTotal },
    { id: 'findings', label: 'Findings', count: findingTotal },
    { id: 'history', label: 'Scan History', count: undefined },
  ];

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = tabs[(index + step + tabs.length) % tabs.length];
    if (next === undefined) return;
    setTab(next.id);
    document.getElementById(`domain-tab-${next.id}`)?.focus();
  };

  return (
    <div className="flex w-full flex-col gap-space-lg">
      {crumbs(d.name)}
      <div className="flex flex-col gap-space-lg">
        <div className="flex flex-col justify-between gap-space-md lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-col gap-space-sm">
            <div className="flex flex-wrap items-center gap-space-sm">
              <h1 className="flex min-w-0 items-center gap-space-xs break-all text-headline-lg text-fg">
                {d.name}
                <CopyButton value={d.name} label="Copy domain" />
              </h1>
              <DnsBadge status={d.dns_status} />
              <Link
                href={`/programs/${encodeURIComponent(d.program_id)}`}
                className="inline-flex items-center gap-space-xs rounded-sm border border-border px-space-sm text-body-code text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-icon">
                  adjust
                </span>
                {programName}
              </Link>
              {toolName !== null && (
                <span className="inline-flex items-center gap-space-xs rounded-sm border border-border px-space-sm text-body-code text-fg-muted">
                  <span aria-hidden="true" className="material-symbols-outlined text-icon">
                    terminal
                  </span>
                  {toolName}
                </span>
              )}
            </div>
            <p className="flex flex-wrap items-center gap-space-xs text-body-default text-fg-muted">
              <span>
                {`First seen ${formatMoment(d.first_seen_at)}`}
                {toolName !== null && <span className="text-fg">{` via ${toolName}`}</span>}
              </span>
              <span aria-hidden="true">·</span>
              <span>{`Last seen ${formatMoment(d.last_seen_at)}`}</span>
              {d.ips.length > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Resolves to</span>
                  {d.ips.map((ip) => (
                    <span key={ip} className="text-body-code text-fg">
                      {ip}
                    </span>
                  ))}
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-space-sm">
            <button
              type="button"
              onClick={() => void copyText(d.name).catch(() => undefined)}
              className={BUTTON}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-icon">
                content_copy
              </span>
              <span>Copy Name</span>
            </button>
            <RunScanButton
              assets={[{ target: d.name, programId: d.program_id }]}
              programName={nameOf}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-space-md md:grid-cols-3 xl:grid-cols-5">
          <Tile label="Assigned IPs" icon="router" value={d.ips.length} />
          <Tile label="URLs" icon="link" value={d.url_count} />
          <Tile label="Services" icon="lan" value={d.service_count} />
          <Tile label="Screenshots" icon="photo_camera" value={shotTotal} />
          <Tile
            label="Findings"
            icon="warning"
            value={findingTotal}
            note={highest === undefined ? undefined : `Highest: ${SEVERITY_LABEL[highest]}`}
          />
        </div>

        <div className="flex flex-col gap-space-md">
          <div
            role="tablist"
            aria-label="Domain sections"
            className="flex items-center gap-space-sm overflow-x-auto border-b border-border"
          >
            {tabs.map((t, index) => (
              <button
                key={t.id}
                id={`domain-tab-${t.id}`}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                aria-controls="domain-panel"
                tabIndex={tab === t.id ? 0 : -1}
                onClick={() => setTab(t.id)}
                onKeyDown={(e) => onTabKey(e, index)}
                className={tab === t.id ? TAB_ON : TAB_OFF}
              >
                {t.label}
                {t.count !== undefined && (
                  <span className="text-caption text-fg-muted">{`(${COUNT.format(t.count)})`}</span>
                )}
              </button>
            ))}
          </div>
          <div
            id="domain-panel"
            role="tabpanel"
            aria-labelledby={`domain-tab-${tab}`}
            className="grid grid-cols-1 gap-space-md lg:grid-cols-12"
          >
            {tab === 'overview' && (
              <>
                <div className="flex flex-col lg:col-span-5">
                  <TargetPanel
                    domain={d}
                    programName={programName}
                    discoverySource={toolName ?? 'Unknown'}
                  />
                </div>
                <div className="flex flex-col gap-space-md lg:col-span-7">
                  <FindingsPanel domain={d} />
                  <CapturePanel
                    latest={screenshots.data?.items[0]}
                    pending={screenshots.isPending}
                  />
                </div>
                <div className="lg:col-span-12">
                  <EventsPanel domainId={d.id} />
                </div>
              </>
            )}
            {tab === 'dns' && (
              <div className="lg:col-span-12">
                <DnsPanel domain={d} />
              </div>
            )}
            {tab === 'urls' && (
              <div className="lg:col-span-12">
                <UrlsTab domainId={d.id} />
              </div>
            )}
            {tab === 'services' && (
              <div className="lg:col-span-12">
                <ServicesTab domainId={d.id} />
              </div>
            )}
            {tab === 'screenshots' && (
              <div className="lg:col-span-12">
                <ScreenshotsPanel domainId={d.id} />
              </div>
            )}
            {tab === 'findings' && (
              <div className="lg:col-span-12">
                <FindingsTab domainId={d.id} />
              </div>
            )}
            {tab === 'history' && (
              <div className="lg:col-span-12">
                <HistoryTab target={d.name} toolModules={modules} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
