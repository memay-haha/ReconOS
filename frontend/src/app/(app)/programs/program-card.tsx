import Link from 'next/link';
import type { ReactElement } from 'react';

import { SEVERITY_LABEL } from '@/lib/findings';
import { type ProgramRow, SEVERITIES } from '@/lib/programs';

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

const SEVERITY_TONE = {
  critical: 'bg-crit-strong-soft text-crit-strong',
  high: 'bg-warn-strong-soft text-warn',
  medium: 'bg-surface-3 text-status-queue',
  low: 'bg-surface-3 text-fg-muted',
  info: 'bg-surface-3 text-fg-faint',
} as const;

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
              <span className="material-symbols-outlined text-[16px]">folder</span>
            </span>
            <div className="min-w-0">
              <h2 className="truncate font-body-code-bold text-body-code-bold text-fg transition-colors group-hover:text-primary">
                {program.name}
              </h2>
              {program.platform === null ? (
                <span className="text-caption text-fg-faint">No platform</span>
              ) : href === null ? (
                <span className="text-caption text-fg-faint">{program.platform}</span>
              ) : (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-caption text-fg-faint underline-offset-2 hover:underline"
                >
                  {program.platform}
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
            {SEVERITIES.map((severity) => (
              <span
                key={severity}
                className={`rounded-sm px-1.5 py-0.5 font-body-code text-caption ${SEVERITY_TONE[severity]}`}
              >
                {COUNT.format(program.finding_counts[severity])} {SEVERITY_LABEL[severity]}
              </span>
            ))}
          </span>
        </div>
      </div>
      <div className="flex items-center justify-end border-t border-surface-2 pt-3">
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
