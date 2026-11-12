'use client';

import Link from 'next/link';
import { type FormEvent, type ReactElement, useState } from 'react';

import { FieldError } from '@/components/field-error';
import { fieldErrorsOf } from '@/lib/api-client';
import { formatMoment } from '@/lib/format-moment';
import { type Job, useJobs } from '@/lib/jobs';
import { type ProgramRow } from '@/lib/programs';
import { type Schedule, useRunSchedule, useSchedules } from '@/lib/schedules';
import {
  RULE_TYPE_LABEL,
  RULE_TYPES,
  type RuleType,
  type ScopeRule,
  useBulkCreateScopeRules,
  useScopeRules,
} from '@/lib/scope-rules';
import { useSystemSetting } from '@/lib/system';
import type { ToolModule } from '@/lib/tool-modules';

import { Dialog } from '../dialog';
import { errorText } from '../error-text';
import { shortId } from '../links';
import { JobStatusBadge } from '../status-badge';
import { ALERT, COUNT, FIELD, LABEL, NOTE } from '../ui';
import { RuleSection } from './scope-panel';

const ICON_BUTTON =
  'flex h-7 w-7 items-center justify-center rounded-sm bg-surface-2 text-fg-muted transition-colors hover:bg-surface-3 hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60';

const ROW_BUTTON =
  'inline-flex items-center gap-1 rounded-sm bg-surface-2 px-2 py-1 font-body-code text-caption text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60';

const SUBMIT =
  'inline-flex h-9 items-center gap-1.5 rounded-sm bg-primary-container px-3.5 text-body-default font-semibold text-accent-ink hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60';

const TH =
  'px-space-md py-2 text-left font-label-caps text-label-caps uppercase tracking-wider text-fg-muted';
const TH_END =
  'px-space-md py-2 text-right font-label-caps text-label-caps uppercase tracking-wider text-fg-muted';
const TD = 'px-space-md py-2.5 align-top';

function every(minutes: number): string {
  if (minutes % 1440 === 0) return `${COUNT.format(minutes / 1440)}d`;
  if (minutes % 60 === 0) return `${COUNT.format(minutes / 60)}h`;
  return `${COUNT.format(minutes)}m`;
}

/** `key=value` pairs of `job.params`, the grey summary beside the scan type. */
export function paramsSummary(params: Readonly<Record<string, unknown>>): string | null {
  const parts = Object.entries(params).map(([key, value]) =>
    typeof value === 'object' ? key : `${key}=${String(value)}`,
  );
  return parts.length === 0 ? null : parts.join(' ');
}

/** add_link (N26): several rules of one type in one request, one value per line. */
function BulkRuleDialog({
  programId,
  onClose,
}: {
  programId: string;
  onClose: () => void;
}): ReactElement {
  const create = useBulkCreateScopeRules(programId);
  const [ruleType, setRuleType] = useState<RuleType>('wildcard');
  const [values, setValues] = useState('');
  const errors = fieldErrorsOf(create.error);
  const failed =
    create.error !== null && Object.keys(errors).length === 0
      ? errorText(create.error, 'Could not add the scope rules.')
      : null;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const items = values
      .split('\n')
      .map((v) => v.trim())
      .filter((v) => v !== '')
      .map((value) => ({
        scope_type: 'in_scope' as const,
        rule_type: ruleType,
        value,
        reason: null,
      }));
    create.mutate(items, { onSuccess: onClose });
  };
  return (
    <Dialog title="Add In-Scope rules" onClose={onClose} busy={create.isPending}>
      <form onSubmit={submit} className="flex flex-col gap-space-md" noValidate>
        <div className="flex flex-col gap-space-sm">
          <label htmlFor="bulk-rule-type" className={LABEL}>
            Rule type
          </label>
          <select
            id="bulk-rule-type"
            value={ruleType}
            onChange={(e) => setRuleType(e.target.value as RuleType)}
            className={FIELD}
          >
            {RULE_TYPES.map((type) => (
              <option key={type} value={type}>
                {RULE_TYPE_LABEL[type]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-space-sm">
          <label htmlFor="bulk-rule-values" className={LABEL}>
            Values, one per line
          </label>
          <textarea
            id="bulk-rule-values"
            rows={6}
            value={values}
            onChange={(e) => setValues(e.target.value)}
            placeholder={'*.example.com\n*.api.example.com'}
            className={`${FIELD} h-auto py-space-sm`}
          />
          <FieldError errors={errors} field="items" />
        </div>
        {failed !== null && (
          <p role="alert" className="text-body-default text-crit-strong">
            {failed}
          </p>
        )}
        <div className="flex justify-end">
          <button type="submit" disabled={create.isPending} className={SUBMIT}>
            Add rules
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function FeedRow({
  schedule,
  moduleName,
  canManage,
}: {
  schedule: Schedule;
  moduleName: string;
  canManage: boolean;
}): ReactElement {
  const run = useRunSchedule();
  return (
    <li className="flex items-center justify-between gap-space-sm rounded-sm bg-surface-2/60 p-2.5">
      <div className="flex min-w-0 items-start gap-2.5">
        <span
          aria-hidden="true"
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${schedule.is_enabled ? 'bg-good' : 'bg-fg-faint'}`}
        />
        <div className="flex min-w-0 flex-col">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-body-code-bold text-body-code text-fg">{moduleName}</span>
            <span
              className={`rounded-sm px-1.5 font-label-caps text-label-caps uppercase ${schedule.is_enabled ? 'bg-good-soft text-good' : 'bg-surface-3 text-fg-muted'}`}
            >
              {schedule.is_enabled ? 'Enabled' : 'Disabled'}
            </span>
          </span>
          <span className="truncate text-caption text-fg-faint">
            {schedule.target.join(', ')} · every {every(schedule.interval_minutes)} · last run{' '}
            {schedule.last_run_at === null ? 'never' : formatMoment(schedule.last_run_at)}
          </span>
          {run.isError && (
            <span role="alert" className="text-caption text-crit-strong">
              {errorText(run.error, 'Could not trigger the schedule.')}
            </span>
          )}
          {run.isSuccess && (
            <span role="status" className="text-caption text-good">
              Job created.
            </span>
          )}
        </div>
      </div>
      {canManage && (
        <button
          type="button"
          disabled={run.isPending}
          onClick={() => run.mutate(schedule.id)}
          aria-label={`Trigger ${moduleName} now`}
          className={ROW_BUTTON}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
            replay
          </span>
          Trigger
        </button>
      )}
    </li>
  );
}

/** The mockup's "Seed Targets & Discovery Feeds": each schedule as a feed row (N29). */
function SeedFeeds({
  programId,
  canManage,
  moduleNames,
}: {
  programId: string;
  canManage: boolean;
  moduleNames: ReadonlyMap<string, string>;
}): ReactElement {
  const schedules = useSchedules({ programId });
  const rows = schedules.data?.items ?? [];
  return (
    <section
      aria-label="Seed Targets & Discovery Feeds"
      className="flex flex-col gap-space-md rounded-sm bg-surface p-space-lg shadow-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-panel-title text-panel-title text-fg">
          <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-primary">
            satellite_alt
          </span>
          Seed Targets &amp; Discovery Feeds
        </h2>
        {schedules.data !== undefined && (
          <span className="rounded-sm bg-surface-2 px-2 py-0.5 font-body-code text-caption text-primary">
            {COUNT.format(schedules.data.total)}{' '}
            {schedules.data.total === 1 ? 'schedule' : 'schedules'}
          </span>
        )}
      </div>
      {schedules.isPending && <p className="text-caption text-fg-muted">Loading schedules…</p>}
      {schedules.isError && (
        <p role="alert" className="text-caption text-crit-strong">
          {errorText(schedules.error, 'Could not load the schedules.')}
        </p>
      )}
      {schedules.data !== undefined && rows.length === 0 && (
        <p className="text-body-default text-fg-muted">No schedule for this program.</p>
      )}
      {rows.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {rows.map((schedule) => (
            <FeedRow
              key={schedule.id}
              schedule={schedule}
              moduleName={
                moduleNames.get(schedule.tool_module_id) ?? shortId(schedule.tool_module_id)
              }
              canManage={canManage}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function triggeredBy(job: Job): string {
  if (job.created_by === null) return 'Schedule';
  return job.created_by_username ?? shortId(job.created_by);
}

/** "Recent Scan Trigger History": the program's latest jobs, newest first. */
function ScanHistory({
  program,
  moduleNames,
  showLogLink,
}: {
  program: ProgramRow;
  moduleNames: ReadonlyMap<string, string>;
  showLogLink: boolean;
}): ReactElement {
  const jobs = useJobs({ programId: program.id, sort: '-created_at', limit: 10 });
  // N30: a public setting, readable by every role.
  const retention = useSystemSetting('log_retention_days');
  const days = typeof retention.data?.value === 'number' ? retention.data.value : null;
  return (
    <section
      aria-label="Recent Scan Trigger History"
      className="flex flex-col rounded-sm bg-surface shadow-sm"
    >
      <div className="flex flex-col justify-between gap-2 p-space-lg pb-space-md md:flex-row md:items-center">
        <h2 className="flex items-center gap-2 font-panel-title text-panel-title text-fg">
          <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-primary">
            history
          </span>
          <span>
            Recent Scan Trigger History for{' '}
            <span className="font-body-code-bold text-primary">{program.name}</span>
          </span>
        </h2>
        <span className="flex items-center gap-2 text-caption text-fg-faint">
          {days !== null && <span>Log retention: {COUNT.format(days)} days</span>}
          {days !== null && showLogLink && <span aria-hidden="true">·</span>}
          {/* N31 asks for the log viewer filtered by this program; the S15 log panel has no
              program filter yet, so the link opens the panel itself. */}
          {showLogLink && (
            <Link
              href="/system#application-log"
              className="font-medium text-primary hover:underline"
            >
              Full Log View
            </Link>
          )}
        </span>
      </div>
      {jobs.isPending && <p className={NOTE}>Loading jobs…</p>}
      {jobs.isError && (
        <p role="alert" className={ALERT}>
          {errorText(jobs.error, 'Could not load the jobs of this program.')}
        </p>
      )}
      {jobs.data !== undefined && jobs.data.items.length === 0 && (
        <p className={NOTE}>No jobs for this program yet.</p>
      )}
      {jobs.data !== undefined && jobs.data.items.length > 0 && (
        <div className="overflow-x-auto px-space-lg pb-space-lg">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead className="bg-surface-2">
              <tr>
                <th className={TH}>Job ID</th>
                <th className={TH}>Target</th>
                <th className={TH}>Tool module</th>
                <th className={TH}>Triggered By</th>
                <th className={TH}>Status</th>
                <th className={TH_END}>Completed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-2">
              {jobs.data.items.map((job) => {
                const params = paramsSummary(job.params);
                return (
                  <tr key={job.id} className="hover:bg-surface-2/60">
                    <td
                      className={`${TD} font-body-code text-body-code text-primary`}
                      title={job.id}
                    >
                      {shortId(job.id)}
                    </td>
                    <td className={`${TD} break-all font-body-code text-body-code text-fg`}>
                      {job.target.join(', ')}
                    </td>
                    <td className={TD}>
                      <span className="rounded-sm bg-surface-2 px-1.5 py-0.5 font-body-code text-caption text-fg">
                        {job.tool_module_name ??
                          moduleNames.get(job.tool_module_id) ??
                          shortId(job.tool_module_id)}
                      </span>
                      {params !== null && (
                        <span className="ml-2 font-body-code text-caption text-fg-faint">
                          ({params})
                        </span>
                      )}
                    </td>
                    <td className={`${TD} text-body-default text-fg-muted`}>
                      <span className="flex items-center gap-1.5">
                        <span
                          aria-hidden="true"
                          className="material-symbols-outlined text-[14px] text-fg-faint"
                        >
                          {job.created_by === null ? 'schedule' : 'person'}
                        </span>
                        {triggeredBy(job)}
                      </span>
                    </td>
                    <td className={TD}>
                      <JobStatusBadge status={job.status} />
                    </td>
                    <td
                      className={`${TD} whitespace-nowrap text-right font-body-code text-caption text-fg-muted`}
                    >
                      {job.finished_at === null ? '-' : formatMoment(job.finished_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** N25: the Overview tab is the mockup's page body: scope, feeds and the job history. */
export function OverviewPanel({
  program,
  canManage,
  showLogLink,
  toolModules,
  onScanWildcards,
}: {
  program: ProgramRow;
  canManage: boolean;
  showLogLink: boolean;
  toolModules: readonly ToolModule[];
  /** radar (N26): Run Scan prefilled with every In-Scope wildcard. */
  onScanWildcards: (targets: readonly string[]) => void;
}): ReactElement {
  const rules = useScopeRules(program.id);
  const [bulk, setBulk] = useState(false);
  const moduleNames = new Map(toolModules.map((m) => [m.id, m.name]));
  const items: readonly ScopeRule[] = rules.data?.items ?? [];
  const inScope = items.filter((r) => r.scope_type === 'in_scope');
  const wildcards = inScope.filter((r) => r.rule_type === 'wildcard').map((r) => r.value);
  const editable = canManage && program.status !== 'archived';

  return (
    <div className="flex flex-col gap-space-lg">
      {rules.isPending && <p className={NOTE}>Loading scope rules…</p>}
      {rules.isError && (
        <p role="alert" className={ALERT}>
          {errorText(rules.error, 'Could not load the scope rules.')}
        </p>
      )}
      <div className="grid grid-cols-1 items-start gap-space-lg lg:grid-cols-2">
        {rules.data !== undefined && (
          <RuleSection
            programId={program.id}
            scopeType="in_scope"
            rules={inScope}
            canManage={editable}
            collapseAt={6}
            actions={
              <>
                {program.status !== 'archived' && (
                  <button
                    type="button"
                    disabled={wildcards.length === 0}
                    onClick={() => onScanWildcards(wildcards)}
                    aria-label="Run Scan on every In-Scope wildcard"
                    title="Run Scan on every In-Scope wildcard"
                    className={ICON_BUTTON}
                  >
                    <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                      radar
                    </span>
                  </button>
                )}
                {editable && (
                  <button
                    type="button"
                    onClick={() => setBulk(true)}
                    aria-label="Add several In-Scope rules"
                    title="Add several In-Scope rules"
                    className={ICON_BUTTON}
                  >
                    <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                      add_link
                    </span>
                  </button>
                )}
              </>
            }
          />
        )}
        <div className="flex flex-col gap-space-lg">
          {rules.data !== undefined && (
            <RuleSection
              programId={program.id}
              scopeType="out_of_scope"
              rules={items.filter((r) => r.scope_type === 'out_of_scope')}
              canManage={editable}
            />
          )}
          <SeedFeeds programId={program.id} canManage={editable} moduleNames={moduleNames} />
        </div>
      </div>
      <ScanHistory program={program} moduleNames={moduleNames} showLogLink={showLogLink} />
      {bulk && <BulkRuleDialog programId={program.id} onClose={() => setBulk(false)} />}
    </div>
  );
}
