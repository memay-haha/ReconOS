import type { DnsStatus } from '@/lib/domains';
import type { Severity } from '@/lib/programs';

/** Shared by S03, S04 and S05 so the three screens name and colour things the same way. */

export const COUNT = new Intl.NumberFormat('en-US');

/** Values of `domain.dns_status` in docs/data/schema.md, in schema order. */
export const DNS_LABEL: Readonly<Record<DnsStatus, string>> = {
  unknown: 'Unknown',
  resolved: 'Resolved',
  nxdomain: 'NXDOMAIN',
  timeout: 'Timeout',
};

/** Badge text in the tables: the schema value itself, as the mockup prints it, with the one
 * acronym kept in capitals. The filter buttons keep the title-case `DNS_LABEL`. */
export const DNS_BADGE: Readonly<Record<DnsStatus, string>> = {
  unknown: 'unknown',
  resolved: 'resolved',
  nxdomain: 'NXDOMAIN',
  timeout: 'timeout',
};

export const DNS_TONE: Readonly<Record<DnsStatus, string>> = {
  unknown: 'border-neutral-bd bg-neutral-soft text-fg-muted',
  resolved: 'border-good-bd bg-good-soft text-good',
  nxdomain: 'border-crit-bd bg-crit-soft text-crit',
  timeout: 'border-warn-bd bg-warn-soft text-warn',
};

export const DNS_DOT: Readonly<Record<DnsStatus, string>> = {
  unknown: 'bg-fg-muted',
  resolved: 'bg-good',
  nxdomain: 'bg-crit',
  timeout: 'bg-warn',
};

export const SEVERITY_SHORT: Readonly<Record<Severity, string>> = {
  critical: 'C',
  high: 'H',
  medium: 'M',
  low: 'L',
  info: 'I',
};

export const SEVERITY_TONE: Readonly<Record<Severity, string>> = {
  critical: 'border-crit-bd bg-crit-soft text-crit',
  high: 'border-warn-bd bg-warn-soft text-warn',
  medium: 'border-info-bd bg-info-soft text-info',
  low: 'border-good-bd bg-good-soft text-good',
  info: 'border-neutral-bd bg-neutral-soft text-fg-muted',
};

export const SEVERITY_BAR: Readonly<Record<Severity, string>> = {
  critical: 'bg-crit',
  high: 'bg-warn',
  medium: 'bg-info',
  low: 'bg-good',
  info: 'bg-fg-muted',
};

// Control sizes follow the S03 and S04 mockups: 32 px controls, 12 px text, 15 px icons.
export const FIELD =
  'h-8 rounded-sm border border-border bg-surface-2 px-2.5 text-xs text-fg focus:outline-none focus:ring-2 focus:ring-ring';

export const BUTTON =
  'inline-flex h-8 items-center gap-1.5 rounded-sm border border-border bg-surface px-3 text-xs text-fg hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60';

export const PRIMARY_BUTTON =
  'inline-flex h-8 items-center gap-1.5 rounded-sm bg-primary-container px-space-md font-body-code text-body-code-bold text-accent-ink hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60';

export const BUTTON_ICON = 'material-symbols-outlined text-[15px] text-fg-muted';
export const PRIMARY_ICON = 'material-symbols-outlined text-[15px]';

/** The compact buttons of a selection bar. */
export const BAR_BUTTON =
  'inline-flex h-6 items-center gap-1 rounded-sm border border-border bg-surface px-2 text-xs font-medium text-fg hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60';
export const BAR_ICON = 'material-symbols-outlined text-[13px] text-fg-muted';

/** Segmented filter: a 2 px track holding small pill buttons. */
export const SEGMENTS =
  'flex flex-wrap items-center rounded-sm border border-border bg-surface-2 p-0.5';
const SEGMENT = 'rounded-sm px-2.5 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring';
export const SEGMENT_ON = SEGMENT + ' bg-surface-3 font-medium text-fg';
export const SEGMENT_OFF = SEGMENT + ' text-fg-muted hover:text-fg';

/** A small framed count beside a toolbar, such as "14,892 records". */
export const COUNT_TAG =
  'rounded-sm border border-border bg-surface-2 px-2 py-1 font-body-code text-xs text-fg-faint whitespace-nowrap';

/** The table card and its parts. */
export const TABLE_CARD =
  'flex w-full flex-col overflow-hidden rounded-lg border border-border bg-surface';
export const HEAD = 'px-3.5 py-2 font-semibold whitespace-nowrap';
export const CELL = 'px-3.5 py-2 whitespace-nowrap';
export const HEAD_ROW =
  'h-8 border-b border-border bg-surface-2 text-[11px] font-semibold uppercase tracking-wider text-fg-muted';
export const TBODY = 'divide-y divide-border/40 text-xs';
export const CHECKBOX = 'h-4 w-4 cursor-pointer accent-primary-container';
export const ROW = 'text-fg transition-colors hover:bg-surface-2';
// Selected rows: the mockup's half-tone surface-3; this token keeps the domain icon at AA in light.
export const ROW_SELECTED = 'bg-surface-container-low text-fg';
/** Mono cells: numbers, addresses, times. */
export const MONO = 'font-body-code text-xs text-fg';
export const MONO_MUTED = 'font-body-code text-[11px] text-fg-muted';
export const MONO_FAINT = 'font-body-code text-[11px] text-fg-faint';
/** The program name as a small framed tag. */
export const PROGRAM_TAG =
  'rounded-sm border border-border bg-surface-2 px-1.5 py-0.5 font-body-code text-[11px] text-fg-muted';
/** Footer below a table: count, pager and page size. */
export const TABLE_FOOT =
  'flex flex-wrap items-center justify-between gap-space-sm border-t border-border bg-surface px-4 py-1';
export const LIMIT_LABEL = 'text-[11px] text-fg-faint';
export const LIMIT_FIELD =
  'h-7 rounded-sm border border-border bg-surface-2 px-2 font-body-code text-xs text-fg focus:outline-none focus:ring-2 focus:ring-ring';

/** Page sizes offered beside the pager: `limit` in docs/api/architecture.md. */
export const PAGE_SIZES = [25, 50, 100] as const;

export const IN_SCOPE_OPTIONS = [
  { value: '', label: 'Any scope' },
  { value: 'true', label: 'In-Scope' },
  { value: 'false', label: 'Out-of-Scope' },
] as const;

export function parseInScope(value: string): boolean | null {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

/** A link only for addresses a browser opens as a page. Anything else from a target stays text. */
export function safeHttpHref(value: string | null): string | null {
  if (value === null) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

/** The clipboard is missing outside a secure context, so a failure is a rejected promise. */
export function copyText(value: string): Promise<void> {
  if (typeof navigator === 'undefined' || navigator.clipboard === undefined) {
    return Promise.reject(new Error('clipboard unavailable'));
  }
  return navigator.clipboard.writeText(value);
}
