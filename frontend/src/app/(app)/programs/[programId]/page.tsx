'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
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
import { ALERT, COUNT, NOTE, PRIMARY_BUTTON } from '../ui';
import { JobsPanel } from './jobs-panel';
import { ProxiesPanel } from './proxies-panel';
import { SchedulesPanel } from './schedules-panel';
import { ScopePanel } from './scope-panel';
import { UsersPanel } from './users-panel';

type Tab = 'scope' | 'schedules' | 'jobs' | 'users' | 'proxies';

const TABS: readonly { id: Tab; label: string; manageOnly: boolean }[] = [
  { id: 'scope', label: 'Scope', manageOnly: false },
  { id: 'schedules', label: 'Schedules', manageOnly: false },
  { id: 'jobs', label: 'Jobs', manageOnly: false },
  { id: 'users', label: 'Users', manageOnly: true },
  { id: 'proxies', label: 'Proxies', manageOnly: true },
];

const TAB =
  'border-b-2 border-transparent px-space-md py-space-sm text-body-default text-fg-muted hover:text-fg aria-selected:border-primary aria-selected:text-fg focus:outline-none focus:ring-2 focus:ring-ring';

const SEVERITY_SHORT = { critical: 'Crit', high: 'High', medium: 'Med', low: 'Low', info: 'Info' };

function findingNote(program: ProgramRow): string {
  return SEVERITIES.map(
    (s) => `${COUNT.format(program.finding_counts[s])} ${SEVERITY_SHORT[s]}`,
  ).join(' · ');
}

function findingTotal(program: ProgramRow): number {
  return SEVERITIES.reduce((sum, s) => sum + program.finding_counts[s], 0);
}

/** S09: one program, opened from S08 or S11. */
export default function ProgramDetailPage(): ReactElement {
  const params = useParams<{ programId: string }>();
  const programId = params.programId;
  const router = useRouter();
  const me = useMe();
  const role = me.data?.role ?? null;
  const canManage = role === 'superadmin' || role === 'admin';
  const program = useProgram(programId);
  const toolModules = useToolModules();
  const createJob = useCreateJob();
  const [tab, setTab] = useState<Tab>('scope');
  const [scanning, setScanning] = useState(false);
  const tabs = TABS.filter((t) => canManage || !t.manageOnly);
  const modules = toolModules.data?.items ?? [];

  if (program.isPending) return <p className={NOTE}>Loading the program…</p>;
  if (program.isError) {
    return (
      <div className="flex flex-col gap-space-md">
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

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = tabs[(index + step + tabs.length) % tabs.length];
    if (next === undefined) return;
    setTab(next.id);
    document.getElementById(`program-tab-${next.id}`)?.focus();
  };

  return (
    <div className="flex w-full flex-col gap-space-lg">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-space-xs text-caption text-fg-faint"
      >
        <Link href="/programs" className="flex items-center gap-space-xs hover:text-fg">
          <span aria-hidden="true" className="material-symbols-outlined text-icon">
            arrow_back
          </span>
          Programs
        </Link>
        <span aria-hidden="true" className="material-symbols-outlined text-icon">
          chevron_right
        </span>
        <span className="text-fg-muted">{p.name}</span>
      </nav>

      <div className="flex flex-col justify-between gap-space-md md:flex-row md:items-end">
        <div className="flex flex-col gap-space-xs">
          <div className="flex flex-wrap items-center gap-space-sm">
            <h1 className="text-headline-lg text-fg">{p.name}</h1>
            <ProgramStatusBadge status={p.status} />
          </div>
          <div className="flex flex-wrap items-center gap-space-md text-caption text-fg-faint">
            <span>Created {formatMoment(p.created_at)}</span>
            <span>Updated {formatMoment(p.updated_at)}</span>
            {p.platform !== null &&
              (href === null ? (
                <span>{p.platform}</span>
              ) : (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {p.platform}
                </a>
              ))}
          </div>
          {p.description !== null && (
            <p className="max-w-2xl text-body-default text-fg-muted">{p.description}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-space-sm">
          <ProgramActions program={p} role={role} onGone={() => router.push('/programs')} />
          {p.status !== 'archived' && (
            <button type="button" onClick={() => setScanning(true)} className={PRIMARY_BUTTON}>
              <span aria-hidden="true" className="material-symbols-outlined text-icon">
                play_arrow
              </span>
              Run Scan
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-space-md md:grid-cols-3 xl:grid-cols-5">
        <StatTile label="Domains" icon="public" tone="domain" value={p.domain_count} />
        <StatTile label="URLs" icon="link" tone="info" value={p.url_count} />
        <StatTile label="IPs" icon="dns" tone="warn" value={p.ip_count} />
        <StatTile label="Services" icon="hub" tone="muted" value={p.service_count} />
        <StatTile
          label="Findings"
          icon="bug_report"
          tone="crit"
          value={findingTotal(p)}
          note={findingNote(p)}
        />
      </div>

      <div
        role="tablist"
        aria-label="Program sections"
        className="flex flex-wrap border-b border-border"
      >
        {tabs.map((t, index) => (
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
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`program-panel-${tab}`}
        aria-labelledby={`program-tab-${tab}`}
        className="flex flex-col gap-space-md"
      >
        {tab === 'scope' && (
          <ScopePanel programId={p.id} canManage={canManage && p.status !== 'archived'} />
        )}
        {tab === 'schedules' && (
          <SchedulesPanel
            programId={p.id}
            canManage={canManage && p.status !== 'archived'}
            toolModules={modules}
          />
        )}
        {tab === 'jobs' && (
          <JobsPanel programId={p.id} meId={me.data?.id ?? null} toolModules={modules} />
        )}
        {tab === 'users' && canManage && <UsersPanel programId={p.id} />}
        {tab === 'proxies' && canManage && <ProxiesPanel programId={p.id} />}
      </div>

      <RunScanDialog
        open={scanning}
        programName={p.name}
        targets={[]}
        editableTargets
        toolModules={modules}
        pending={createJob.isPending}
        error={createJob.error}
        onClose={() => {
          setScanning(false);
          createJob.reset();
        }}
        onSubmit={(request) =>
          createJob.mutate(
            { program_id: p.id, tool_module_id: request.toolModuleId, target: request.target },
            { onSuccess: () => setScanning(false) },
          )
        }
      />
    </div>
  );
}
