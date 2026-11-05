import type { ToolGroup } from '@/lib/tool-modules';

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
