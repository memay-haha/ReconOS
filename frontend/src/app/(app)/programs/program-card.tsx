import Link from 'next/link';
import type { ReactElement } from 'react';

import { formatAgo } from '@/lib/format-ago';
import { formatMoment } from '@/lib/format-moment';
import type { ProgramRow, Severity } from '@/lib/programs';

import { safeHref } from './links';
import { ProgramStatusBadge } from './status-badge';
import { COUNT } from './ui';

type AssetCount = 'domain_count' | 'url_count' | 'ip_count' | 'service_count';

const ASSETS: readonly { key: AssetCount; label: string }[] = [
  { key: 'domain_count', label: 'Domains' },
  { key: 'url_count', label: 'URLs' },
  { key: 'ip_count', label: 'IPs' },
  { key: 'service_count', label: 'Services' },
];

const DOT: Readonly<Record<AssetCount, string>> = {
  domain_count: 'bg-asset-domain',
  url_count: 'bg-asset-url',
  ip_count: 'bg-asset-ip',
  service_count: 'bg-asset-service',
};

/** The card shows the three severities the mockup draws; Low and Info stay on S20. */
const CARD_SEVERITIES: readonly Severity[] = ['critical', 'high', 'medium'];

const SEVERITY_SHORT: Readonly<Record<Severity, string>> = {
  critical: 'Crit',
  high: 'High',
  medium: 'Med',
  low: 'Low',
  info: 'Info',
};

const SEVERITY_TONE = {
  critical: 'bg-crit-strong-soft text-crit-strong',
  high: 'bg-warn-strong-soft text-warn',
  medium: 'bg-surface-3 text-status-queue',
  low: 'bg-surface-3 text-fg-muted',
  info: 'bg-surface-3 text-fg-faint',
} as const;

/** A zero count is drawn muted, as the mockup's "0 Crit". */
const SEVERITY_ZERO = 'bg-surface-3 text-fg-muted';

/** Card icon by `bounty_type` (N20). */
const TYPE_ICON: Readonly<Record<ProgramRow['bounty_type'], string>> = {
  bounty: 'paid',
  vdp: 'shield',
};

/** "hackerone/uber" as the mockup writes it: platform and handle (N21). */
export function platformLine(program: Pick<ProgramRow, 'platform' | 'platform_handle'>): string {
  const platform = program.platform?.toLowerCase() ?? null;
  const handle = program.platform_handle ?? null;
  if (platform !== null && handle !== null) return `${platform}/${handle}`;
  return platform ?? handle ?? 'No platform';
}

export function ProgramCard({ program }: { program: ProgramRow }): ReactElement {
  const href = safeHref(program.platform_url);
  const total = ASSETS.reduce((sum, { key }) => sum + program[key], 0);
  return (
    <div
      data-program-card
      className="group flex flex-col justify-between rounded-sm bg-surface p-space-lg shadow-sm transition-colors hover:bg-surface-2"
    >
      <div>
        <div className="mb-2.5 flex items-start justify-between gap-space-sm">
          <div className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-surface-3 text-primary"
            >
              <span className="material-symbols-outlined text-[16px]">
                {TYPE_ICON[program.bounty_type]}
              </span>
            </span>
            <div className="min-w-0">
              <h2 className="truncate font-body-code-bold text-body-code-bold text-fg transition-colors group-hover:text-primary">
                {program.name}
              </h2>
              {href === null ? (
                <span className="text-caption text-fg-faint">{platformLine(program)}</span>
              ) : (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-caption text-fg-faint underline-offset-2 hover:underline"
                >
                  {platformLine(program)}
                </a>
              )}
            </div>
          </div>
          <ProgramStatusBadge status={program.status} />
        </div>
        <p className="mb-4 line-clamp-2 min-h-9 text-body-default text-fg-muted">
          {program.description ?? 'No description.'}
        </p>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 rounded-sm bg-surface-3 px-2 py-1 font-body-code text-caption text-primary">
            <span aria-hidden="true" className="material-symbols-outlined text-[13px]">
              policy
            </span>
            {COUNT.format(program.in_scope_rule_count)} In-Scope
          </span>
          <span className="flex items-center gap-1 rounded-sm bg-surface-3 px-2 py-1 font-body-code text-caption text-fg-faint">
            <span aria-hidden="true" className="material-symbols-outlined text-[13px]">
              block
            </span>
            {COUNT.format(program.out_of_scope_rule_count)} Out-of-Scope
          </span>
        </div>
        <div className="mb-3 rounded-sm bg-surface-2 p-2.5">
          <dl className="mb-2 grid grid-cols-4 gap-1 text-center">
            {ASSETS.map(({ key, label }) => (
              <div key={key}>
                <dt className="mb-0.5 flex items-center justify-center gap-1 font-label-caps text-label-caps text-fg-faint">
                  <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${DOT[key]}`} />
                  {label}
                </dt>
                <dd className="font-body-code-bold text-body-code text-fg">
                  {COUNT.format(program[key])}
                </dd>
              </div>
            ))}
          </dl>
          {/* Share of each asset kind, drawn from the same four counts. */}
          <div
            aria-hidden="true"
            className="flex h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
          >
            {total > 0 &&
              ASSETS.map(({ key }) => (
                <div
                  key={key}
                  className={`h-full ${DOT[key]}`}
                  style={{ width: `${(program[key] / total) * 100}%` }}
                />
              ))}
          </div>
        </div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-space-xs rounded-sm bg-surface-3/40 px-1 py-1.5">
          <span className="font-label-caps text-label-caps uppercase text-fg-faint">Findings</span>
          <span className="flex flex-wrap items-center gap-1">
            {CARD_SEVERITIES.map((severity) => (
              <span
                key={severity}
                className={`rounded-sm px-1.5 py-0.5 font-body-code text-caption ${
                  program.finding_counts[severity] === 0 ? SEVERITY_ZERO : SEVERITY_TONE[severity]
                }`}
              >
                {COUNT.format(program.finding_counts[severity])} {SEVERITY_SHORT[severity]}
              </span>
            ))}
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-surface-2 pt-3">
        <LastScanned at={program.last_job_finished_at ?? null} />
        <Link
          href={`/programs/${program.id}`}
          aria-label={`View details, ${program.name}`}
          className="flex items-center gap-0.5 font-label-caps text-label-caps text-primary transition-transform hover:underline group-hover:translate-x-0.5"
        >
          View Details
          <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
            arrow_forward
          </span>
        </Link>
      </div>
    </div>
  );
}

/** max(`finished_at`) of completed jobs, relative as the mockup writes it (M22). */
function LastScanned({ at }: { at: string | null }): ReactElement {
  return (
    <span
      className="flex items-center gap-1 text-caption text-fg-faint"
      title={at === null ? undefined : formatMoment(at)}
    >
      <span aria-hidden="true" className="material-symbols-outlined text-[14px]">
        schedule
      </span>
      {at === null ? 'Never scanned' : `Last scanned ${formatAgo(at)}`}
    </span>
  );
}
