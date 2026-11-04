/** One definition of the text-on-surface pairs held to WCAG AA: tokens.test.ts proves them
 * and the Component Library page shows them, so the page cannot show a pair that is not covered. */
/**
 * Foreground token on background token, one entry per place the screens paint text or an
 * icon straight onto that fill. A pair earns a line here only when a component renders
 * the first token on the second one; a pair that nothing renders proves nothing.
 *
 * This list is no longer the guard, because nothing could make it fail: the primary button
 * measured 1.22:1 in the light theme while every test stayed green. `rendered-contrast.test.ts`
 * now reads the pairs out of the components themselves and holds each one to AA. What stays
 * here is the register for the two kinds of pair that scan cannot see: a fill painted by a
 * component in another file, and a colour set through the `style` attribute. The same test
 * fails when a screen paints a text colour that is neither resolved by the scan nor listed here.
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
  // The theme button (theme-toggle.tsx): icon at rest, and the icon on hover.
  ['color-on-surface-variant', 'color-surface-2'],
  ['color-on-surface', 'color-surface-container-high'],
  // The sign-out failure notice (sidebar.tsx): it sits outside the account card, so the
  // sidebar canvas is behind it and no element of its own carries the fill.
  ['color-error', 'color-bg'],
];

/** A rendered pair allowed to stay below WCAG AA, with the reason it is allowed. */
export interface ContrastException {
  /** Text colour token, for example `color-fg-faint`. */
  readonly foreground: string;
  readonly background: string;
  /** Why the pair ships below 4.5, and what would retire the exception. */
  readonly reason: string;
}

/**
 * Pairs `rendered-contrast.test.ts` lets through below 4.5. Empty is the expected state:
 * a line here is a promise broken on purpose, so it carries a reason and the test drops it
 * again as soon as the screens stop painting it.
 */
export const CONTRAST_EXCEPTIONS: readonly ContrastException[] = [];
