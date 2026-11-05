import type { ReactElement } from 'react';

import type { DnsStatus } from '@/lib/domains';
import { SEVERITY_LABEL } from '@/lib/findings';
import { type FindingCounts, SEVERITIES } from '@/lib/programs';

import { COUNT, DNS_DOT, DNS_LABEL, DNS_TONE, SEVERITY_SHORT, SEVERITY_TONE } from './asset-ui';

export function DnsBadge({ status }: { status: DnsStatus }): ReactElement {
  return (
    <span
      className={`inline-flex items-center gap-space-xs rounded-sm border px-space-sm text-body-code ${DNS_TONE[status]}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${DNS_DOT[status]}`} />
      <span>{DNS_LABEL[status]}</span>
    </span>
  );
}

/** One chip per severity that has findings, each named in words for assistive technology. */
export function FindingChips({ counts }: { counts: FindingCounts }): ReactElement {
  const present = SEVERITIES.filter((s) => counts[s] > 0);
  if (present.length === 0) return <span className="text-body-code text-fg-muted">None</span>;
  return (
    <div className="flex items-center gap-space-xs">
      {present.map((s) => (
        <span
          key={s}
          // A generic span may not carry a name; as an image the chip reads as one word.
          role="img"
          aria-label={`${COUNT.format(counts[s])} ${SEVERITY_LABEL[s]}`}
          className={`rounded-sm border px-space-xs text-body-code ${SEVERITY_TONE[s]}`}
        >
          {`${SEVERITY_SHORT[s]}:${COUNT.format(counts[s])}`}
        </span>
      ))}
    </div>
  );
}

export function InScopeBadge({ inScope }: { inScope: boolean }): ReactElement {
  return inScope ? (
    <span className="rounded-sm border border-good-bd bg-good-soft px-space-sm text-body-code text-good">
      In-Scope
    </span>
  ) : (
    <span className="rounded-sm border border-crit-bd bg-crit-soft px-space-sm text-body-code text-crit">
      Out-of-Scope
    </span>
  );
}
