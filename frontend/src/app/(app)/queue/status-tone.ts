import type { JobStatus } from '@/lib/jobs';

/* One colour family per job status, shared by the cards, the pipeline bar and the row chips
 * so a status reads the same everywhere on S10. Colours follow the mockup (M7): processing,
 * which is `running` here, is amber; the mockup has no pending approval, so it takes the
 * accent. Flat tables, one per use, because the contrast scanner reads a lookup table but
 * not a property of a looked-up object. */

/** Accent bar, legend swatch, chip dot. */
export const STATUS_FILL: Readonly<Record<JobStatus, string>> = {
  pending_approval: 'bg-primary-container',
  queued: 'bg-outline',
  dispatched: 'bg-info',
  running: 'bg-warn',
  completed: 'bg-good',
  failed: 'bg-crit',
  cancelled: 'bg-fg-faint',
};

/** Figure, icon and caption text on a card. */
export const STATUS_TEXT: Readonly<Record<JobStatus, string>> = {
  pending_approval: 'text-primary',
  queued: 'text-fg',
  dispatched: 'text-info',
  running: 'text-warn',
  completed: 'text-good',
  failed: 'text-crit',
  cancelled: 'text-fg',
};

/** Row chip: soft background, text, border. */
export const STATUS_CHIP: Readonly<Record<JobStatus, string>> = {
  pending_approval: 'bg-accent-soft text-primary border-accent-soft-bd',
  queued: 'bg-neutral-soft text-fg-muted border-neutral-bd',
  dispatched: 'bg-info-soft text-info border-info-bd',
  running: 'bg-warn-soft text-warn border-warn-bd',
  completed: 'bg-good-soft text-good border-good-bd',
  failed: 'bg-crit-soft text-crit border-crit-bd',
  cancelled: 'bg-neutral-soft text-fg-muted border-neutral-bd',
};

/** The mockup colours the card label only on the states that need attention. */
export const STATUS_LABEL_TEXT: Readonly<Record<JobStatus, string>> = {
  pending_approval: 'text-fg-faint',
  queued: 'text-fg-faint',
  dispatched: 'text-fg-faint',
  running: 'text-warn',
  completed: 'text-fg-faint',
  failed: 'text-crit',
  cancelled: 'text-fg-faint',
};
