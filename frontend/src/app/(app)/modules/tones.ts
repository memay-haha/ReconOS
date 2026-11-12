import type { DisabledReason, EngineStatus, ToolGroup } from '@/lib/tool-modules';

/** Recon, Scan, Exploit: docs/appendix/glossary.md. */
export const GROUP_LABEL: Readonly<Record<ToolGroup, string>> = {
  recon: 'Recon',
  scan: 'Scan',
  exploit: 'Exploit',
};

export const GROUP_TONE: Readonly<Record<ToolGroup, string>> = {
  recon: 'bg-info-soft text-info border-info-bd',
  scan: 'bg-accent-soft text-primary border-accent-soft-bd',
  exploit: 'bg-warn-soft text-warn border-warn-bd',
};

export const GROUP_DOT: Readonly<Record<ToolGroup, string>> = {
  recon: 'bg-info',
  scan: 'bg-primary-container',
  exploit: 'bg-warn',
};

/** A checkbox drawn as the mockup's pill switch; it keeps the native input for keyboard and
 * screen readers. */
export const SWITCH_INPUT =
  'relative h-3.5 w-7 shrink-0 cursor-pointer appearance-none rounded-full border border-border-strong bg-surface-2 before:absolute before:left-0.5 before:top-px before:h-2.5 before:w-2.5 before:rounded-full before:bg-fg-muted before:transition-transform checked:border-primary-container checked:bg-primary-container checked:before:translate-x-3 checked:before:bg-accent-ink focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60';

/** N46: the reason a tool module cannot run, from `disabled_reason`. */
export const REASON_LABEL: Readonly<Record<DisabledReason, string>> = {
  off: 'Disabled • Turned off by a Superadmin',
  engine_disabled: 'Unavailable • Engine disabled',
  engine_down: 'Unavailable • Engine down',
  not_installed: 'Unavailable • Not installed on an online worker',
};

export const ENGINE_STATUS_LABEL: Readonly<Record<EngineStatus, string>> = {
  ok: 'OK',
  degraded: 'Degraded',
  down: 'Down',
};

export const ENGINE_STATUS_DOT: Readonly<Record<EngineStatus, string>> = {
  ok: 'bg-good',
  degraded: 'bg-warn',
  down: 'bg-crit',
};

/** The status dot of the table: ready, turned off, or held back by `disabled_reason`. */
export type ModuleState = 'ready' | 'off' | 'held';
export const STATE_DOT: Readonly<Record<ModuleState, string>> = {
  ready: 'bg-good',
  off: 'bg-fg-faint',
  held: 'bg-warn',
};

/** Icon per output type, as the mockup's Target Output line draws them. */
export const OUTPUT_ICON: Readonly<Record<string, string>> = {
  domain: 'language',
  ip: 'dns',
  url: 'link',
  service: 'electrical_services',
  screenshot: 'image',
  finding: 'bug_report',
};

export const KPI_TILE =
  'relative flex flex-col justify-between overflow-hidden rounded-sm border border-border bg-surface p-space-md hover:border-border-strong';
export const KPI_LABEL = 'text-label-caps uppercase tracking-wider text-fg-faint';
export const KPI_FOOT =
  'mt-space-xs flex items-center justify-between gap-space-sm border-t border-border pt-1.5 text-caption text-fg-muted';
