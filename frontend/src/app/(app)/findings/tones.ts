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

/** The 3px bar on top of each severity tile, and the segment of the spectrum bar. */
export const SEVERITY_BAR: Readonly<Record<Severity, string>> = {
  critical: 'bg-crit',
  high: 'bg-crit-strong',
  medium: 'bg-warn',
  low: 'bg-info',
  info: 'bg-fg-faint',
};

export const SEVERITY_TEXT: Readonly<Record<Severity, string>> = {
  critical: 'text-crit',
  high: 'text-crit',
  medium: 'text-warn',
  low: 'text-info',
  info: 'text-fg-muted',
};

export const SEVERITY_ICON: Readonly<Record<Severity, string>> = {
  critical: 'emergency',
  high: 'warning',
  medium: 'crisis_alert',
  low: 'info',
  info: 'description',
};

/** The tile titles of the mockup; "Informational" spells out Info. */
export const SEVERITY_TILE_LABEL: Readonly<Record<Severity, string>> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  info: 'Informational',
};

export const ICON_BUTTON =
  'inline-flex h-6 w-6 items-center justify-center rounded-sm text-fg-muted hover:bg-surface-2 hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring';
export const BULK_BUTTON =
  'inline-flex h-7 items-center gap-1 rounded-sm border border-border bg-surface px-2.5 text-caption font-semibold text-fg hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60';
export const HEADER_BUTTON =
  'inline-flex h-9 items-center gap-1.5 rounded-sm border border-border-strong bg-surface px-3 text-panel-title text-fg hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60';
export const SELECT =
  'h-8 rounded-sm border border-border bg-surface px-2.5 text-caption text-fg focus:border-primary-container focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60';
