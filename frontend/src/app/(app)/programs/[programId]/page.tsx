'use client';

import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type KeyboardEvent, type ReactElement, useState } from 'react';

import { RunScanDialog } from '@/components/run-scan-dialog';
import { useMe } from '@/lib/auth';
import { formatMoment } from '@/lib/format-moment';
import { useCreateJob } from '@/lib/jobs';
import { type ProgramRow, SEVERITIES, useProgram } from '@/lib/programs';
import { useToolModules } from '@/lib/tool-modules';

import { errorText, isNotFound } from '../error-text';
import { safeHref } from '../links';
import { ProgramActions } from '../program-actions';
import { StatTile } from '../stat-tile';
import { ProgramStatusBadge } from '../status-badge';
import { ALERT, COUNT, NOTE } from '../ui';
import { type AssetTab, AssetTabPanel } from './asset-tabs';
import { OverviewPanel } from './overview-panel';
import { ProxiesPanel } from './proxies-panel';
import { SchedulesPanel } from './schedules-panel';
import { ScopePanel } from './scope-panel';
import { UsersPanel } from './users-panel';

type Tab = 'overview' | AssetTab | 'scope' | 'users' | 'proxies';

/** N25: the mockup's tabs with counts, plus Users and Proxies for Superadmin and Admin. */
const TABS: readonly {
  id: Tab;
  label: string;
  manageOnly: boolean;
  count?: (p: ProgramRow) => number | undefined;
}[] = [
  { id: 'overview', label: 'Overview', manageOnly: false },
  { id: 'domains', label: 'Domains', manageOnly: false, count: (p) => p.domain_count },
  { id: 'ips', label: 'IPs', manageOnly: false, count: (p) => p.ip_count },
  { id: 'urls', label: 'URLs', manageOnly: false, count: (p) => p.url_count },
  { id: 'services', label: 'Services', manageOnly: false, count: (p) => p.service_count },
  { id: 'screenshots', label: 'Screenshots', manageOnly: false, count: (p) => p.screenshot_count },
  { id: 'findings', label: 'Findings', manageOnly: false, count: (p) => findingTotal(p) },
  {
    id: 'scope',
    label: 'Scopes & Targets',
    manageOnly: false,
    count: (p) => p.in_scope_rule_count + p.out_of_scope_rule_count,
  },
  { id: 'users', label: 'Users', manageOnly: true },
  { id: 'proxies', label: 'Proxies', manageOnly: true },
];

const TAB_IDS: ReadonlySet<string> = new Set(TABS.map((t) => t.id));

const ASSET_TABS: ReadonlySet<Tab> = new Set<Tab>([
  'domains',
  'ips',
  'urls',
  'services',
  'screenshots',
  'findings',
]);

const TAB =
  'relative flex items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-caption text-fg-muted transition-colors hover:text-fg aria-selected:font-semibold aria-selected:text-primary focus:outline-none focus:ring-2 focus:ring-ring';

const RUN_BUTTON =
  'inline-flex h-9 items-center gap-1.5 rounded-sm bg-primary-container px-4 font-body-code-bold text-caption uppercase tracking-wider text-accent-ink shadow-md transition-all hover:bg-accent-hover hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring active:scale-[0.98]';

const HEADER_BUTTON =
  'inline-flex h-9 items-center gap-1.5 rounded-sm bg-surface-2 px-3 text-panel-title text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg focus:outline-none focus:ring-2 focus:ring-ring';

const CHIP =
  'inline-flex items-center gap-1 rounded-sm bg-surface-2 px-2 py-0.5 font-body-code text-caption text-fg-muted';

const SEVERITY_SHORT = { critical: 'Crit', high: 'High', medium: 'Med', low: 'Low', info: 'Info' };

/** The findings tile names the three severities the mockup draws. */
function findingNote(program: ProgramRow): string {
  return (['critical', 'high', 'medium'] as const)
    .map((s) => `${COUNT.format(program.finding_counts[s])} ${SEVERITY_SHORT[s]}`)
    .join(' · ');
}

function findingTotal(program: ProgramRow): number {
  return SEVERITIES.reduce((sum, s) => sum + program.finding_counts[s], 0);
}

function plusToday(value: number | undefined): string | null {
  return value === undefined ? null : `+${COUNT.format(value)} today`;
}

/** S09: one program, opened from S08 or S11. */
export default function ProgramDetailPage(): ReactElement {
  const params = useParams<{ programId: string }>();
  const programId = params.programId;
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const me = useMe();
  const role = me.data?.role ?? null;
  const canManage = role === 'superadmin' || role === 'admin';
  const program = useProgram(programId);
  const toolModules = useToolModules();
  const createJob = useCreateJob();
  const [scan, setScan] = useState<readonly string[] | null>(null);
  const [copied, setCopied] = useState(false);
  const tabs = TABS.filter((t) => canManage || !t.manageOnly);
  const asked = search.get('tab');
  const tab: Tab =
    asked !== null && TAB_IDS.has(asked) && tabs.some((t) => t.id === asked)
      ? (asked as Tab)
      : 'overview';
  const modules = toolModules.data?.items ?? [];

  // The tab lives in the URL so a reload or a shared link opens the same tab.
  const setTab = (next: Tab) => {
    const query = new URLSearchParams(search.toString());
    if (next === 'overview') query.delete('tab');
    else query.set('tab', next);
    const text = query.toString();
    router.replace(text === '' ? pathname : `${pathname}?${text}`, { scroll: false });
  };

  if (program.isPending) return <p className={NOTE}>Loading the program…</p>;
  if (program.isError) {
    return (
      <div className="flex flex-col gap-space-md p-margin">
        <Link href="/programs" className="text-body-default text-primary hover:underline">
          Back to Programs
        </Link>
        <p role="alert" className={ALERT}>
          {isNotFound(program.error)
            ? 'This program does not exist, or you have no access to it.'
            : errorText(program.error, 'Could not load the program.')}
        </p>
      </div>
    );
  }
  const p = program.data;
  const href = safeHref(p.platform_url);
  const editable = canManage && p.status !== 'archived';
  const coverage =
    p.scope_coverage === undefined || p.scope_coverage === null
      ? null
      : `${(p.scope_coverage * 100).toFixed(1)}%`;

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = tabs[(index + step + tabs.length) % tabs.length];
    if (next === undefined) return;
    setTab(next.id);
    document.getElementById(`program-tab-${next.id}`)?.focus();
  };

  const copyName = () => {
    void navigator.clipboard?.writeText(p.name).then(() => setCopied(true));
  };

  return (
    <div className="flex w-full flex-col gap-space-lg p-margin">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-caption text-fg-faint">
        <Link href="/programs" className="group flex items-center gap-1 hover:text-fg">
          <span
            aria-hidden="true"
            className="material-symbols-outlined text-[14px] transition-transform group-hover:-translate-x-0.5"
          >
            arrow_back
          </span>
          Programs
        </Link>
        <span aria-hidden="true" className="material-symbols-outlined text-[12px] opacity-40">
          chevron_right
        </span>
        <span className="font-body-code text-caption font-medium text-fg-muted">{p.name}</span>
      </nav>

      <div className="flex flex-col justify-between gap-space-md xl:flex-row xl:items-center">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-space-sm">
            <h1 className="font-body-code-bold text-headline-lg tracking-tight text-fg">
              {p.name}
            </h1>
            <ProgramStatusBadge status={p.status} />
            {p.platform !== null && (
              <span className={CHIP}>
                <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
                  verified_user
                </span>
                {href === null ? (
                  p.platform
                ) : (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-primary hover:underline"
                  >
                    {p.platform}
                  </a>
                )}
                {p.platform_handle != null && <span>ID {p.platform_handle}</span>}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 text-body-default text-fg-muted">
            <span>Created {formatMoment(p.created_at)}</span>
            {p.created_by_username != null && (
              <>
                <span aria-hidden="true" className="text-fg-faint">
                  ·
                </span>
                <span>
                  Maintained by <span className="font-medium text-fg">{p.created_by_username}</span>
                </span>
              </>
            )}
            {coverage !== null && (
              <>
                <span aria-hidden="true" className="text-fg-faint">
                  ·
                </span>
                <span className="flex items-center gap-1 text-primary">
                  <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
                    language
                  </span>
                  Scope coverage: <span className="font-body-code-bold">{coverage}</span>
                </span>
              </>
            )}
          </div>
          {p.description !== null && (
            <p className="max-w-2xl text-body-default text-fg-muted">{p.description}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 self-start xl:self-center">
          <button type="button" onClick={copyName} className={HEADER_BUTTON}>
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
              {copied ? 'check' : 'content_copy'}
            </span>
            {copied ? 'Copied' : 'Copy Name'}
          </button>
          {editable && (
            <button type="button" onClick={() => setTab('scope')} className={HEADER_BUTTON}>
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                add_business
              </span>
              Add Scope
            </button>
          )}
          <ProgramActions program={p} role={role} onGone={() => router.push('/programs')} />
          {p.status !== 'archived' && (
            <button type="button" onClick={() => setScan([])} className={RUN_BUTTON}>
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
                play_arrow
              </span>
              Run Scan
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-space-sm md:grid-cols-3 xl:grid-cols-5">
        <StatTile
          dense
          label="Domains"
          icon="public"
          tone="domain"
          value={p.domain_count}
          note={plusToday(p.assets_new_today?.domain)}
        />
        <StatTile
          dense
          label="Discovered URLs"
          icon="link"
          tone="url"
          value={p.url_count}
          note={plusToday(p.assets_new_today?.url)}
        />
        <StatTile
          dense
          label="IPs"
          icon="dns"
          tone="ip"
          value={p.ip_count}
          note={
            p.ip_resolved_count === undefined
              ? null
              : `${COUNT.format(p.ip_resolved_count)} resolved`
          }
        />
        <StatTile
          dense
          label="Services"
          icon="hub"
          tone="service"
          value={p.service_count}
          note={
            p.service_port_count === undefined
              ? null
              : `${COUNT.format(p.service_port_count)} unique ports`
          }
        />
        <StatTile
          dense
          label="Findings"
          icon="bug_report"
          tone="crit"
          value={findingTotal(p)}
          note={findingNote(p)}
        />
      </div>

      <div className="flex w-full items-center gap-1 overflow-x-auto rounded-sm bg-surface-2/60 px-2">
        <div role="tablist" aria-label="Program sections" className="flex items-center gap-1">
          {tabs.map((t, index) => {
            const count = t.count?.(p);
            return (
              <button
                key={t.id}
                id={`program-tab-${t.id}`}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                aria-controls={`program-panel-${t.id}`}
                tabIndex={tab === t.id ? 0 : -1}
                onClick={() => setTab(t.id)}
                onKeyDown={(e) => onTabKey(e, index)}
                className={TAB}
              >
                {t.label}
                {count !== undefined && (
                  <span
                    className={
                      t.id === 'findings'
                        ? 'rounded-sm bg-crit-soft px-1 font-body-code text-caption text-crit'
                        : 'font-body-code text-caption text-fg-faint'
                    }
                  >
                    {t.id === 'findings' ? COUNT.format(count) : `(${COUNT.format(count)})`}
                  </span>
                )}
                {tab === t.id && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary-container"
                  />
                )}
              </button>
            );
          })}
        </div>
        {p.status !== 'archived' && (
          <button
            type="button"
            onClick={() => setScan([])}
            className="ml-auto flex shrink-0 items-center gap-1 whitespace-nowrap px-3 py-2.5 text-caption text-fg-muted hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
              tune
            </span>
            Run Scan (Configure)
          </button>
        )}
      </div>

      <div
        role="tabpanel"
        id={`program-panel-${tab}`}
        aria-labelledby={`program-tab-${tab}`}
        className="flex flex-col gap-space-md"
      >
        {tab === 'overview' && (
          <OverviewPanel
            program={p}
            canManage={canManage}
            showLogLink={canManage}
            toolModules={modules}
            onScanWildcards={(targets) => setScan(targets)}
          />
        )}
        {ASSET_TABS.has(tab) && <AssetTabPanel tab={tab as AssetTab} programId={p.id} />}
        {tab === 'scope' && (
          <>
            <ScopePanel programId={p.id} canManage={editable} />
            <SchedulesPanel programId={p.id} canManage={editable} toolModules={modules} />
          </>
        )}
        {tab === 'users' && canManage && <UsersPanel programId={p.id} />}
        {tab === 'proxies' && canManage && <ProxiesPanel programId={p.id} />}
      </div>

      <RunScanDialog
        open={scan !== null}
        programName={p.name}
        targets={scan ?? []}
        editableTargets
        toolModules={modules}
        pending={createJob.isPending}
        error={createJob.error}
        onClose={() => {
          setScan(null);
          createJob.reset();
        }}
        onSubmit={(request) =>
          createJob.mutate(
            {
              program_id: p.id,
              tool_module_id: request.toolModuleId,
              target: request.target,
              priority: request.priority,
              params: request.params,
            },
            { onSuccess: () => setScan(null) },
          )
        }
      />
    </div>
  );
}
