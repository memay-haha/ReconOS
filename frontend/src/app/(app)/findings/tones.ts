import type { TriageStatus } from '@/lib/findings';
import type { Severity } from '@/lib/programs';

export const SEVERITY_TONE: Readonly<Record<Severity, string>> = {
  critical: 'bg-crit-strong-soft text-crit border-crit-strong-bd',
  high: 'bg-crit-soft text-crit border-crit-bd',
  medium: 'bg-warn-soft text-warn border-warn-bd',
  low: 'bg-info-soft text-info border-info-bd',
  info: 'bg-neutral-soft text-fg-muted border-neutral-bd',
};

export const TRIAGE_TONE: Readonly<Record<TriageStatus, string>> = {
  new: 'bg-accent-soft text-primary border-accent-soft-bd',
  confirmed: 'bg-crit-soft text-crit border-crit-bd',
  false_positive: 'bg-neutral-soft text-fg-muted border-neutral-bd',
  duplicate: 'bg-neutral-soft text-fg-muted border-neutral-bd',
  reported: 'bg-info-soft text-info border-info-bd',
  resolved: 'bg-good-soft text-good border-good-bd',
};

export const BADGE = 'inline-flex items-center rounded-sm border px-space-xs text-body-code';
