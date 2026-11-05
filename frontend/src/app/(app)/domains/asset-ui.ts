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

export const FIELD =
  'h-9 rounded-sm border border-border bg-surface px-space-md text-body-default text-fg focus:outline-none focus:ring-2 focus:ring-ring';

export const BUTTON =
  'inline-flex h-9 items-center gap-space-xs rounded-sm border border-border bg-surface px-space-md text-body-default text-fg hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60';

export const PRIMARY_BUTTON =
  'inline-flex h-9 items-center gap-space-xs rounded-sm bg-primary-container px-space-md font-body-code-bold text-body-default text-accent-ink hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60';

export const HEAD = 'px-space-md py-space-sm';
export const CELL = 'px-space-md py-space-sm whitespace-nowrap';
export const HEAD_ROW =
  'h-8 border-b border-border bg-surface-2 text-label-caps uppercase text-fg-muted';

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
