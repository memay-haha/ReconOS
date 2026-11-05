'use client';

import { type KeyboardEvent, type ReactElement, useState } from 'react';

import { Pagination, useCursorStack } from '@/components/pagination';
import { DNS_STATUSES, type DnsStatus, domainExportHref, useDomains } from '@/lib/domains';
import { useIps } from '@/lib/ips';
import type { Page } from '@/lib/page';
import { useServices } from '@/lib/services';
import { useUrls } from '@/lib/urls';

import {
  BAR_BUTTON,
  BAR_ICON,
  BUTTON,
  BUTTON_ICON,
  copyText,
  COUNT,
  COUNT_TAG,
  DNS_LABEL,
  FIELD,
  IN_SCOPE_OPTIONS,
  LIMIT_FIELD,
  LIMIT_LABEL,
  PAGE_SIZES,
  parseInScope,
  SEGMENT_OFF,
  SEGMENT_ON,
  SEGMENTS,
  TABLE_CARD,
  TABLE_FOOT,
} from '../domains/asset-ui';
import { RunScanButton } from '../domains/run-scan-button';
import { useProgramOptions } from '../domains/use-program-options';
import { useSelection } from '../domains/use-selection';
import { DomainsTable, IpsTable, ServicesTable, UrlsTable } from './asset-tables';

// Each asset class keeps its colour from the design system on its tab icon.
const TABS = [
  { id: 'domains', label: 'Domains', icon: 'language', noun: 'domains' },
  { id: 'ips', label: 'IPs', icon: 'router', noun: 'IPs' },
  { id: 'urls', label: 'URLs', icon: 'link', noun: 'URLs' },
  { id: 'services', label: 'Services', icon: 'dns', noun: 'services' },
] as const;
type TabId = (typeof TABS)[number]['id'];
const TAB_TONE: Readonly<Record<TabId, string>> = {
  domains: 'text-asset-domain',
  ips: 'text-asset-ip',
  urls: 'text-asset-url',
  services: 'text-asset-service',
};

const TAB =
  'flex items-center gap-1.5 whitespace-nowrap border-b-2 px-0.5 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring';
const TAB_ON = TAB + ' border-primary-container font-medium text-primary';
const TAB_OFF = TAB + ' border-transparent text-fg-muted hover:text-fg';

type AnyPage = Page<unknown>;

export default function MonitorPage(): ReactElement {
  const { programs, nameOf } = useProgramOptions();
  const [tab, setTab] = useState<TabId>('domains');
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [programId, setProgramId] = useState('');
  const [dnsStatus, setDnsStatus] = useState<DnsStatus | null>(null);
  const [inScope, setInScope] = useState('');
  const [limit, setLimit] = useState<number>(PAGE_SIZES[0]);
  const [copied, setCopied] = useState<'done' | 'failed' | null>(null);
  const { cursor, canGoBack, goNext, goBack, reset } = useCursorStack();
  const selection = useSelection();

  const program = programId === '' ? null : programId;
  const domainFilter = {
    programId: program,
    dnsStatus,
    inScope: parseInScope(inScope),
    sort: 'name',
    limit,
  };
  // Only the open tab asks for rows; the others wait until they are opened.
  const domains = useDomains(domainFilter, cursor, { enabled: tab === 'domains' });
  const ips = useIps({ programId: program, limit }, cursor, { enabled: tab === 'ips' });
  const urls = useUrls({ programId: program, limit }, cursor, { enabled: tab === 'urls' });
  const services = useServices({ programId: program, limit }, cursor, {
    enabled: tab === 'services',
  });
  const current = { domains, ips, urls, services }[tab];
  // The dot on Filters tells that a filter narrows the list, even with the row hidden.
  const filtering =
    programId !== '' || (tab === 'domains' && (dnsStatus !== null || inScope !== ''));
  const data = current.data as AnyPage | undefined;
  const noun = TABS.find((t) => t.id === tab)?.noun ?? 'rows';

  const restart = () => {
    reset();
    selection.clear();
    setCopied(null);
  };

  const openTab = (next: TabId) => {
    setTab(next);
    restart();
  };

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = TABS[(index + step + TABS.length) % TABS.length];
    if (next === undefined) return;
    openTab(next.id);
    document.getElementById(`monitor-tab-${next.id}`)?.focus();
  };

  const copyNames = () => {
    const text = selection.assets.map((a) => a.target).join('\n');
    copyText(text).then(
      () => setCopied('done'),
      () => setCopied('failed'),
    );
  };

  return (
    // The mockup's page head sits 12 px under the topbar (px-4 pt-3); the sides come from
    // the route's ScreenFrame.
    <div className="flex w-full flex-col gap-space-sm pt-3">
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="whitespace-nowrap font-headline-lg text-headline-lg-mobile tracking-tight text-fg">
              Asset Monitor
            </h1>
            <span className="hidden truncate border-l border-border pl-3 text-xs text-fg-faint xl:inline">
              All discovered assets across the programs you can see.
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-space-sm">
            <button
              type="button"
              aria-expanded={filtersOpen}
              aria-controls="monitor-filters"
              onClick={() => setFiltersOpen((open) => !open)}
              className={BUTTON}
            >
              <span aria-hidden="true" className={BUTTON_ICON}>
                filter_list
              </span>
              <span>Filters</span>
              {filtering && (
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full bg-primary-container"
                />
              )}
            </button>
            {tab === 'domains' && (
              <a href={domainExportHref(domainFilter)} download className={BUTTON}>
                <span aria-hidden="true" className={BUTTON_ICON}>
                  download
                </span>
                <span>Export CSV</span>
              </a>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between overflow-x-auto border-b border-border">
          <div role="tablist" aria-label="Asset classes" className="flex items-center gap-6">
            {TABS.map((t, index) => (
              <button
                key={t.id}
                id={`monitor-tab-${t.id}`}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                aria-controls="monitor-panel"
                tabIndex={tab === t.id ? 0 : -1}
                onClick={() => openTab(t.id)}
                onKeyDown={(e) => onTabKey(e, index)}
                className={tab === t.id ? TAB_ON : TAB_OFF}
              >
                <span
                  aria-hidden="true"
                  className={`material-symbols-outlined text-[16px] ${TAB_TONE[t.id]}`}
                >
                  {t.icon}
                </span>
                <span>{t.label}</span>
                {tab === t.id && data !== undefined && (
                  <span className="rounded-sm bg-accent-soft px-1.5 py-0.5 font-body-code text-[11px] font-semibold text-primary">
                    {(data.total_is_estimate ? '~' : '') + COUNT.format(data.total)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {filtersOpen && (
          <div
            id="monitor-filters"
            className="flex flex-wrap items-center justify-between gap-2.5 pt-0.5"
          >
            <div className="flex flex-wrap items-center gap-2">
              <div>
                <label htmlFor="monitor-program" className="sr-only">
                  Program
                </label>
                <select
                  id="monitor-program"
                  value={programId}
                  onChange={(e) => {
                    setProgramId(e.target.value);
                    restart();
                  }}
                  className={FIELD}
                >
                  <option value="">All programs</option>
                  {programs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              {/* dns_status and in_scope filter GET /domains only: docs/api/openapi.yaml. */}
              {tab === 'domains' && (
                <>
                  <div className={SEGMENTS}>
                    {[null, ...DNS_STATUSES].map((value) => (
                      <button
                        key={value ?? 'all'}
                        type="button"
                        aria-pressed={dnsStatus === value}
                        onClick={() => {
                          setDnsStatus(value);
                          restart();
                        }}
                        className={dnsStatus === value ? SEGMENT_ON : SEGMENT_OFF}
                      >
                        {value === null ? 'All' : DNS_LABEL[value]}
                      </button>
                    ))}
                  </div>
                  <label className="flex items-center">
                    <span className="sr-only">Scope</span>
                    <select
                      value={inScope}
                      onChange={(e) => {
                        setInScope(e.target.value);
                        restart();
                      }}
                      className={FIELD}
                    >
                      {IN_SCOPE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {data !== undefined && (
                <span className={COUNT_TAG}>
                  {(data.total_is_estimate ? '~' : '') + `${COUNT.format(data.total)} records`}
                </span>
              )}
            </div>
          </div>
        )}

        {selection.ids.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-accent-soft-bd bg-accent-soft px-3 py-1.5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined text-[16px] text-primary"
                >
                  check_circle
                </span>
                <span className="whitespace-nowrap text-xs font-medium text-primary">
                  {`${COUNT.format(selection.ids.size)} assets selected`}
                </span>
              </div>
              <div aria-hidden="true" className="h-3.5 w-px bg-accent-soft-bd" />
              <div className="flex flex-wrap items-center gap-1.5">
                <button type="button" onClick={copyNames} className={BAR_BUTTON}>
                  <span aria-hidden="true" className={BAR_ICON}>
                    content_copy
                  </span>
                  <span>Copy Names</span>
                </button>
                <RunScanButton assets={selection.assets} programName={nameOf} compact />
                {copied !== null && (
                  <span role="status" className="text-caption text-fg-muted">
                    {copied === 'done' ? 'Copied.' : 'Could not copy.'}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                selection.clear();
                setCopied(null);
              }}
              className="flex items-center gap-1 whitespace-nowrap rounded-sm px-1.5 py-0.5 text-xs text-fg-muted hover:bg-surface hover:text-crit focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
                close
              </span>
              <span>Clear Selection</span>
            </button>
          </div>
        )}
      </div>

      <div
        id="monitor-panel"
        role="tabpanel"
        aria-labelledby={`monitor-tab-${tab}`}
        className={TABLE_CARD}
      >
        <div className="w-full">
          {current.isPending && (
            <p className="px-space-md py-space-xl text-body-default text-fg-muted">
              {`Loading ${noun}…`}
            </p>
          )}
          {current.isError && (
            <p role="alert" className="px-space-md py-space-xl text-body-default text-crit">
              {`Could not load the ${noun}.`}
            </p>
          )}
          {data !== undefined && data.items.length === 0 && (
            <p className="px-space-md py-space-xl text-center text-body-default text-fg-muted">
              {`No ${noun} match these filters.`}
            </p>
          )}
          {tab === 'domains' && domains.data !== undefined && domains.data.items.length > 0 && (
            <DomainsTable
              rows={domains.data.items}
              selected={selection.ids}
              programName={nameOf}
              onToggle={(r) => selection.toggle(r.id, { target: r.name, programId: r.program_id })}
              onToggleAll={(on) =>
                selection.setMany(
                  domains.data.items.map(
                    (r) => [r.id, { target: r.name, programId: r.program_id }] as const,
                  ),
                  on,
                )
              }
            />
          )}
          {tab === 'ips' && ips.data !== undefined && ips.data.items.length > 0 && (
            <IpsTable
              rows={ips.data.items}
              selected={selection.ids}
              programName={nameOf}
              onToggle={(r) =>
                selection.toggle(r.id, { target: r.address, programId: r.program_id })
              }
              onToggleAll={(on) =>
                selection.setMany(
                  ips.data.items.map(
                    (r) => [r.id, { target: r.address, programId: r.program_id }] as const,
                  ),
                  on,
                )
              }
            />
          )}
          {tab === 'urls' && urls.data !== undefined && urls.data.items.length > 0 && (
            <UrlsTable
              rows={urls.data.items}
              selected={selection.ids}
              programName={nameOf}
              onToggle={(r) => selection.toggle(r.id, { target: r.url, programId: r.program_id })}
              onToggleAll={(on) =>
                selection.setMany(
                  urls.data.items.map(
                    (r) => [r.id, { target: r.url, programId: r.program_id }] as const,
                  ),
                  on,
                )
              }
            />
          )}
          {tab === 'services' && services.data !== undefined && services.data.items.length > 0 && (
            <ServicesTable rows={services.data.items} programName={nameOf} />
          )}
        </div>

        {data !== undefined && (
          <div className={TABLE_FOOT}>
            <Pagination
              label={`Asset pagination`}
              page={{
                total: data.total,
                totalIsEstimate: data.total_is_estimate,
                nextCursor: data.next_cursor,
              }}
              canGoBack={canGoBack}
              onBack={() => {
                goBack();
                selection.clear();
              }}
              onNext={() => {
                goNext(data.next_cursor);
                selection.clear();
              }}
            />
            <div className="flex items-center gap-space-sm">
              <label htmlFor="monitor-limit" className={LIMIT_LABEL}>
                Rows per page
              </label>
              <select
                id="monitor-limit"
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  restart();
                }}
                className={LIMIT_FIELD}
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {`${size} / page`}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
