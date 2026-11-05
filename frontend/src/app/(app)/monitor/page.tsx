'use client';

import { type KeyboardEvent, type ReactElement, useState } from 'react';

import { Pagination, useCursorStack } from '@/components/pagination';
import { DNS_STATUSES, type DnsStatus, domainExportHref, useDomains } from '@/lib/domains';
import { useIps } from '@/lib/ips';
import type { Page } from '@/lib/page';
import { useServices } from '@/lib/services';
import { useUrls } from '@/lib/urls';

import {
  BUTTON,
  copyText,
  COUNT,
  DNS_LABEL,
  FIELD,
  IN_SCOPE_OPTIONS,
  PAGE_SIZES,
  parseInScope,
} from '../domains/asset-ui';
import { RunScanButton } from '../domains/run-scan-button';
import { useProgramOptions } from '../domains/use-program-options';
import { useSelection } from '../domains/use-selection';
import { DomainsTable, IpsTable, ServicesTable, UrlsTable } from './asset-tables';

const TABS = [
  { id: 'domains', label: 'Domains', icon: 'language', noun: 'domains' },
  { id: 'ips', label: 'IPs', icon: 'router', noun: 'IPs' },
  { id: 'urls', label: 'URLs', icon: 'link', noun: 'URLs' },
  { id: 'services', label: 'Services', icon: 'dns', noun: 'services' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const TAB =
  'flex items-center gap-space-xs border-b-2 py-space-sm text-body-default focus:outline-none focus:ring-2 focus:ring-ring';
const TAB_ON = TAB + ' border-primary text-fg';
const TAB_OFF = TAB + ' border-transparent text-fg-muted hover:text-fg';

const SEGMENT =
  'h-8 rounded-sm px-space-sm text-body-default focus:outline-none focus:ring-2 focus:ring-ring';
const SEGMENT_ON = SEGMENT + ' bg-surface-3 text-fg';
const SEGMENT_OFF = SEGMENT + ' text-fg-muted hover:text-fg';

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
    <div className="flex w-full flex-col gap-space-md">
      <div className="flex flex-col gap-space-md">
        <div className="flex flex-wrap items-center justify-between gap-space-sm pt-space-xs">
          <div className="flex flex-wrap items-baseline gap-space-sm">
            <h1 className="text-headline-lg text-fg">Asset Monitor</h1>
            <span className="text-body-default text-fg-muted">
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
              <span aria-hidden="true" className="material-symbols-outlined text-icon">
                filter_list
              </span>
              <span>Filters</span>
            </button>
            {tab === 'domains' && (
              <a href={domainExportHref(domainFilter)} download className={BUTTON}>
                <span aria-hidden="true" className="material-symbols-outlined text-icon">
                  download
                </span>
                <span>Export CSV</span>
              </a>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between overflow-x-auto border-b border-border">
          <div role="tablist" aria-label="Asset classes" className="flex items-center gap-space-lg">
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
                <span aria-hidden="true" className="material-symbols-outlined text-icon">
                  {t.icon}
                </span>
                <span>{t.label}</span>
                {tab === t.id && data !== undefined && (
                  <span className="rounded-sm bg-surface-2 px-space-xs text-caption text-fg-muted">
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
            className="flex flex-wrap items-center justify-between gap-space-sm"
          >
            <div className="flex flex-wrap items-center gap-space-sm">
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
                  <div className="flex flex-wrap items-center gap-space-xs rounded-sm border border-border bg-surface-2 p-space-xs">
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
                  <label className="flex items-center gap-space-sm text-body-default text-fg">
                    <span>Scope</span>
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
            <div className="flex items-center gap-space-sm">
              {data !== undefined && (
                <span className="text-body-code text-fg-muted">
                  {(data.total_is_estimate ? '~' : '') + `${COUNT.format(data.total)} records`}
                </span>
              )}
            </div>
          </div>
        )}

        {selection.ids.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-space-sm rounded-sm border border-accent-soft-bd bg-accent-soft px-space-md py-space-sm">
            <div className="flex flex-wrap items-center gap-space-md">
              <div className="flex items-center gap-space-xs">
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined text-icon text-primary"
                >
                  check_circle
                </span>
                <span className="text-body-code text-primary">
                  {`${COUNT.format(selection.ids.size)} selected`}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-space-sm">
                <button type="button" onClick={copyNames} className={BUTTON}>
                  <span aria-hidden="true" className="material-symbols-outlined text-icon">
                    content_copy
                  </span>
                  <span>Copy Names</span>
                </button>
                <RunScanButton assets={selection.assets} programName={nameOf} />
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
              className={BUTTON}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-icon">
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
        className="flex w-full flex-col overflow-hidden rounded-sm border border-border bg-surface"
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
          <div className="flex flex-wrap items-center justify-between gap-space-sm border-t border-border bg-surface-2 px-space-md">
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
              <label htmlFor="monitor-limit" className="text-body-default text-fg-muted">
                Rows per page
              </label>
              <select
                id="monitor-limit"
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  restart();
                }}
                className={FIELD}
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
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
