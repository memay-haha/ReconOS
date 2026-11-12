import type { ReactElement } from 'react';

import type { DnsStatus } from '@/lib/domains';
import { SEVERITY_LABEL } from '@/lib/findings';
import { type FindingCounts, SEVERITIES, type Severity } from '@/lib/programs';

import { COUNT, DNS_BADGE, DNS_DOT, DNS_TONE, SEVERITY_SHORT } from './asset-ui';

// S04 mockup: critical and high stand out in colour and bold; lower severities stay neutral.
const CHIP_TONE: Readonly<Record<Severity, string>> = {
  critical: 'border-crit-bd bg-crit-soft font-bold text-crit',
  high: 'border-warn-bd bg-warn-soft font-bold text-warn',
  medium: 'border-transparent bg-surface-2 text-fg-muted',
  low: 'border-transparent bg-surface-2 text-fg-muted',
  info: 'border-transparent bg-surface-2 text-fg-muted',
};

export function DnsBadge({ status }: { status: DnsStatus }): ReactElement {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-body-code text-[11px] font-medium ${DNS_TONE[status]}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${DNS_DOT[status]}`} />
      <span>{DNS_BADGE[status]}</span>
    </span>
  );
}

/** One chip per severity that has findings, each named in words for assistive technology. */
export function FindingChips({ counts }: { counts: FindingCounts }): ReactElement {
  const present = SEVERITIES.filter((s) => counts[s] > 0);
  if (present.length === 0)
    return <span className="font-body-code text-[11px] text-fg-faint">None</span>;
  return (
    <div className="flex items-center gap-1 font-body-code text-[11px]">
      {present.map((s) => (
        <span
          key={s}
          // A generic span may not carry a name; as an image the chip reads as one word.
          role="img"
          aria-label={`${COUNT.format(counts[s])} ${SEVERITY_LABEL[s]}`}
          className={`rounded-sm border px-1.5 ${CHIP_TONE[s]}`}
        >
          {`${SEVERITY_SHORT[s]}:${COUNT.format(counts[s])}`}
        </span>
      ))}
    </div>
  );
}

export function InScopeBadge({ inScope }: { inScope: boolean }): ReactElement {
  return inScope ? (
    <span className="rounded-sm border border-good-bd bg-good-soft px-1.5 py-0.5 font-body-code text-[11px] text-good">
      In-Scope
    </span>
  ) : (
    <span className="rounded-sm border border-crit-bd bg-crit-soft px-1.5 py-0.5 font-body-code text-[11px] text-crit">
      Out-of-Scope
    </span>
  );
}
