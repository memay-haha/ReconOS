'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type KeyboardEvent, type ReactElement, Suspense, useEffect, useState } from 'react';

import { Pagination, useCursorStack } from '@/components/pagination';
import { useHiddenColumns } from '@/lib/column-prefs';
import { type DnsStatus, type DomainFilter, domainExportHref, useDomains } from '@/lib/domains';
import { assetExportHref, useIps } from '@/lib/ips';
import type { Page } from '@/lib/page';
import { useRealtimeStatus } from '@/lib/realtime';
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
import { Popover } from '../domains/popover';
import { RunScanButton } from '../domains/run-scan-button';
import { useProgramOptions } from '../domains/use-program-options';
import { useSelection } from '../domains/use-selection';
import {
  COLUMNS,
  DomainsTable,
  hideable,
  IpsTable,
  ServicesTable,
  UrlsTable,
} from './asset-tables';

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

function tabOf(value: string | null): TabId {
  return TABS.find((t) => t.id === value)?.id ?? 'domains';
}

// Decision M4: "Unresolved" is nxdomain and timeout; unknown is neither.
const DNS_SEGMENTS: readonly { label: string; value: readonly DnsStatus[] | null }[] = [
  { label: 'All', value: null },
  { label: 'Resolved', value: ['resolved'] },
  { label: 'Unresolved', value: ['nxdomain', 'timeout'] },
];

const TAB =
  'relative flex items-center gap-1.5 whitespace-nowrap px-0.5 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring';
const TAB_ON = TAB + ' font-medium text-primary';
const TAB_OFF = TAB + ' text-fg-muted hover:text-fg';
const TAB_COUNT_ON =
  'rounded-sm bg-accent-soft px-1.5 py-0.5 font-body-code text-[11px] font-semibold text-primary';
const TAB_COUNT_OFF =
  'rounded-sm bg-surface-3 px-1.5 py-0.5 font-body-code text-[11px] text-fg-muted';

/** Typing settles for this long before the list asks again. */
const QUICK_FILTER_MS = 300;

type AnyPage = Page<unknown>;

function countOf(page: AnyPage | undefined): string | null {
  return page === undefined ? null : (page.total_is_estimate ? '~' : '') + COUNT.format(page.total);
}

/** useSearchParams needs a Suspense boundary for the static render. */
export default function MonitorPage(): ReactElement {
  return (
    <Suspense>
      <MonitorScreen />
    </Suspense>
  );
}

function MonitorScreen(): ReactElement {
  const { programs, nameOf } = useProgramOptions();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const tab = tabOf(search.get('tab'));
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [columnsOpen, setColumnsOpen] = useState(false);
  // S09 "Open full list" links pass the program.
  const [programId, setProgramId] = useState(search.get('program_id') ?? '');
  const [dnsSegment, setDnsSegment] = useState(0);
  const [inScope, setInScope] = useState('');
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState<number>(PAGE_SIZES[0]);
  const [copied, setCopied] = useState<'done' | 'failed' | null>(null);
  const { cursor, canGoBack, depth, goNext, goBack, reset } = useCursorStack();
  const selection = useSelection();
  const clearSelection = selection.clear;
  const columns = useHiddenColumns(`monitor.${tab}`);
  const live = useRealtimeStatus() === 'open';

  const program = programId === '' ? null : programId;
  const query = q.trim() === '' ? null : q.trim();
  const domainFilter: DomainFilter = {
    programId: program,
    dnsStatus: DNS_SEGMENTS[dnsSegment]?.value ?? null,
    inScope: parseInScope(inScope),
    q: query,
    sort: 'name',
  };
  const assetFilter = { programId: program, q: query };
  // The open tab reads its page; the other tabs read one row each, for the count on the tab.
  const sized = <T extends object>(f: T, open: boolean) => ({ ...f, limit: open ? limit : 1 });
  const domains = useDomains(
    sized(domainFilter, tab === 'domains'),
    tab === 'domains' ? cursor : null,
  );
  const ips = useIps(sized(assetFilter, tab === 'ips'), tab === 'ips' ? cursor : null);
  const urls = useUrls(sized(assetFilter, tab === 'urls'), tab === 'urls' ? cursor : null);
  const services = useServices(
    sized(assetFilter, tab === 'services'),
    tab === 'services' ? cursor : null,
  );
  const results = { domains, ips, urls, services };
  const current = results[tab];
  const data = current.data as AnyPage | undefined;
  const noun = TABS.find((t) => t.id === tab)?.noun ?? 'rows';
  // The dot on Filters tells that a filter narrows the list, even with the row hidden.
  const filtering =
    programId !== '' ||
    query !== null ||
    (tab === 'domains' && (dnsSegment !== 0 || inScope !== ''));
  const selectedIds = [...selection.ids];
  const exportHref = (ids?: readonly string[]) =>
    tab === 'domains'
      ? domainExportHref(domainFilter, { ids })
      : assetExportHref(`/${tab}`, assetFilter, { ids });

  const restart = () => {
    reset();
    selection.clear();
    setCopied(null);
  };

  // The quick filter asks again once typing pauses, not on every key.
  useEffect(() => {
    if (typed === q) return;
    const timer = setTimeout(() => {
      setQ(typed);
      reset();
      clearSelection();
    }, QUICK_FILTER_MS);
    return () => clearTimeout(timer);
  }, [typed, q, reset, clearSelection]);

  const openTab = (next: TabId) => {
    // The tab lives in the URL, so S02 "View all" can open Services directly.
    // The program filter lives in state from here on; the URL keeps only the tab.
    router.replace(`${pathname}?tab=${next}`, { scroll: false });
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
            {/* Decision N8: shown while the list is narrowed to In-Scope assets. */}
            {parseInScope(inScope) === true && (
              <span className="whitespace-nowrap rounded-full bg-accent-soft px-2 py-0.5 font-body-code text-[11px] font-semibold uppercase tracking-wider text-primary">
                Active Scope
              </span>
            )}
            <span className="hidden truncate border-l border-border pl-3 text-xs text-fg-faint xl:inline">
              Cross-query all discovered assets across programs with unified filters.
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
            <a href={exportHref()} download className={BUTTON}>
              <span aria-hidden="true" className={BUTTON_ICON}>
                download
              </span>
              <span>Export CSV</span>
            </a>
          </div>
        </div>

        <div className="flex items-center justify-between border-b border-border">
          <div
            role="tablist"
            aria-label="Asset classes"
            className="flex items-center gap-6 overflow-x-auto"
          >
            {TABS.map((t, index) => {
              const count = countOf(results[t.id].data as AnyPage | undefined);
              return (
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
                  {count !== null && (
                    <span className={tab === t.id ? TAB_COUNT_ON : TAB_COUNT_OFF}>{count}</span>
                  )}
                  {tab === t.id && (
                    <span
                      aria-hidden="true"
                      className="absolute right-0 bottom-0 left-0 h-0.5 bg-primary-container"
                    />
                  )}
                </button>
              );
            })}
          </div>
          {/* Decision N7: the WebSocket state; lists refresh on its events. */}
          <div className="hidden items-center gap-1.5 whitespace-nowrap pb-0.5 font-caption text-xs text-fg-faint sm:flex">
            <span
              aria-hidden="true"
              className={`h-2 w-2 rounded-full ${live ? 'bg-good' : 'bg-warn'}`}
            />
            <span>{live ? 'Sync Realtime' : 'Reconnecting'}</span>
          </div>
        </div>

        {filtersOpen && (
          <div
            id="monitor-filters"
            className="flex flex-wrap items-center justify-between gap-2.5 pt-0.5"
          >
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <div className="relative max-w-md min-w-65 flex-1">
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[16px] text-fg-faint"
                >
                  search
                </span>
                <input
                  type="search"
                  aria-label="Quick filter"
                  placeholder="Quick filter (e.g. *.example.com or 198.51.100.*)..."
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  className="h-8 w-full rounded-sm border border-border bg-surface-2 pr-3 pl-8 font-body-code text-xs text-fg placeholder:text-fg-faint focus:border-primary-container focus:outline-none"
                />
              </div>
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
                  <option value="">{`All programs (${COUNT.format(programs.length)})`}</option>
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
                  <div role="group" aria-label="DNS status" className={SEGMENTS}>
                    {DNS_SEGMENTS.map((segment, index) => (
                      <button
                        key={segment.label}
                        type="button"
                        aria-pressed={dnsSegment === index}
                        onClick={() => {
                          setDnsSegment(index);
                          restart();
                        }}
                        className={dnsSegment === index ? SEGMENT_ON : SEGMENT_OFF}
                      >
                        {segment.label}
                      </button>
                    ))}
                  </div>
                  {/* Decision N9: the In-scope select stays, though the mockup has none. */}
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
            <div className="flex shrink-0 items-center gap-2">
              {data !== undefined && (
                <span className={COUNT_TAG}>
                  {(data.total_is_estimate ? '~' : '') + `${COUNT.format(data.total)} records`}
                </span>
              )}
              <Popover
                open={columnsOpen}
                onClose={() => setColumnsOpen(false)}
                label="Columns"
                button={
                  <button
                    type="button"
                    aria-label="Customize columns"
                    title="Customize columns"
                    aria-expanded={columnsOpen}
                    onClick={() => setColumnsOpen((open) => !open)}
                    className="rounded-sm border border-border bg-surface p-1.5 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                      view_column
                    </span>
                  </button>
                }
              >
                <ul className="space-y-1">
                  {hideable(COLUMNS[tab]).map((column) => (
                    <li key={column}>
                      <label className="flex items-center gap-2 rounded-sm px-1.5 py-1 text-xs text-fg hover:bg-surface-2">
                        <input
                          type="checkbox"
                          checked={!columns.hidden.has(column)}
                          onChange={() => columns.toggle(column)}
                          className="h-4 w-4 accent-primary-container"
                        />
                        {column}
                      </label>
                    </li>
                  ))}
                </ul>
              </Popover>
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
                <a href={exportHref(selectedIds)} download className={BAR_BUTTON}>
                  <span aria-hidden="true" className={BAR_ICON}>
                    file_download
                  </span>
                  <span>Export Selected</span>
                </a>
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
              hidden={columns.hidden}
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
              hidden={columns.hidden}
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
              hidden={columns.hidden}
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
            <ServicesTable
              rows={services.data.items}
              hidden={columns.hidden}
              programName={nameOf}
            />
          )}
        </div>

        {data !== undefined && (
          <div className={TABLE_FOOT}>
            <Pagination
              label="Asset pagination"
              page={{
                total: data.total,
                totalIsEstimate: data.total_is_estimate,
                nextCursor: data.next_cursor,
              }}
              shown={data.items.length}
              start={depth * limit + 1}
              noun="records"
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
                Density:
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
