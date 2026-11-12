/** Class strings shared by the part B screens (S08 to S11), so the four screens draw the
 * same control the same way. Plain constants: the contrast scanner reads them. */

export const PANEL = 'rounded-sm border border-border bg-surface';

export const HEADER_BUTTON =
  'inline-flex h-9 items-center gap-space-sm rounded-sm px-space-lg text-body-default focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60';

export const PRIMARY_BUTTON = `${HEADER_BUTTON} bg-primary-container font-semibold text-accent-ink hover:bg-accent-hover`;

export const SECONDARY_BUTTON = `${HEADER_BUTTON} border border-border-strong bg-surface text-fg hover:bg-surface-2`;

/** Small text button for a row or a card action. */
export const ROW_BUTTON =
  'inline-flex items-center gap-space-xs rounded-sm border border-border bg-surface px-space-sm py-space-xs text-caption text-fg hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60';

export const DANGER_BUTTON =
  'inline-flex items-center gap-space-xs rounded-sm border border-crit-strong-bd bg-crit-strong-soft px-space-sm py-space-xs text-caption text-crit-strong hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60';

export const FIELD =
  'h-10 w-full rounded-sm border border-border bg-surface-2 px-space-md font-body-code text-body-code text-fg focus:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-ring';

export const LABEL = 'font-label-caps text-label-caps uppercase tracking-wider text-fg-muted';

export const TH =
  'px-space-md py-space-sm text-left font-label-caps text-label-caps uppercase text-fg-muted';

export const TD = 'px-space-md py-space-sm align-top text-body-default text-fg';

export const NOTE = 'px-space-md py-space-xl text-body-default text-fg-muted';

export const ALERT = 'px-space-md py-space-md text-body-default text-crit-strong';

export const COUNT = new Intl.NumberFormat('en-US');
