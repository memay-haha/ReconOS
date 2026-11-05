import type { TriageStatus } from '@/lib/findings';
import type { Severity } from '@/lib/programs';

/** The mockup paints critical solid, but ink on that red fails WCAG AA in the light theme,
 * so critical keeps the stronger tint instead. */
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

/** The dot in front of a triage chip, in the chip's own colour. */
export const TRIAGE_DOT: Readonly<Record<TriageStatus, string>> = {
  new: 'bg-primary-container',
  confirmed: 'bg-crit',
  false_positive: 'bg-fg-faint',
  duplicate: 'bg-fg-faint',
  reported: 'bg-info',
  resolved: 'bg-good',
};

export const BADGE =
  'inline-flex items-center rounded-sm border px-1.5 py-0.5 font-body-code font-semibold text-caption uppercase leading-none';
export const CHIP =
  'inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-body-code text-caption';
