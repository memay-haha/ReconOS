/** One definition of the text-on-surface pairs held to WCAG AA: tokens.test.ts proves them
 * and the Component Library page shows them, so the page cannot show a pair that is not covered. */
/**
 * Foreground token on background token, one entry per place the screens paint text or an
 * icon straight onto that fill. A pair earns a line here only when a component renders
 * the first token on the second one; a pair that nothing renders proves nothing.
 */
export const TEXT_SURFACES = ['color-bg', 'color-surface', 'color-surface-2', 'color-surface-3'];
// Text tokens that any screen may set on any of the four surfaces.
const TEXT_ON_ANY_SURFACE = [
  'color-fg-muted',
  'color-fg-faint',
  'color-crit-strong',
  'color-status-pink',
  'color-status-violet',
  'color-status-queue',
  'color-status-targets',
];
// fg-dim and fg-dimmest are scoped to the backgrounds the mockups really set them on
// (traced per text element): constraining them to the worst case flattened the grey ramp.
// The mockup hexes of fg-faint, fg-dim and fg-dimmest failed AA, so their values
// deliberately depart from them (debt 24).
export const DIM_BACKGROUNDS = [
  'color-bg',
  'color-surface-dim',
  'color-surface-container-low',
  'color-surface-container',
];

export const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ...TEXT_ON_ANY_SURFACE.flatMap((fg) => TEXT_SURFACES.map((bg) => [fg, bg] as const)),
  ...DIM_BACKGROUNDS.map((bg) => ['color-fg-dim', bg] as const),
  ['color-fg-dimmest', 'color-bg'],
  // Amber and red strong badges.
  ['color-warn', 'color-warn-strong-soft'],
  ['color-crit-strong', 'color-crit-strong-soft'],
  // Text and icons laid over the capture thumbnail backdrops.
  ...['good', 'info', 'violet', 'rose', 'warm'].map(
    (name) => ['color-fg', `color-thumb-${name}`] as const,
  ),
  // Body text on the application canvas behind every screen.
  ['color-fg', 'color-bg'],
  // Body text inside cards, panels and table rows.
  ['color-fg', 'color-surface'],
  // Secondary text on a card: column headers, timestamps, helper lines.
];
