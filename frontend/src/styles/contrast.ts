/**
 * WCAG 2.1 relative luminance and contrast ratio, used by the token contrast test to
 * prove both palettes in docs/design/design-system.md reach level AA.
 */

const SIX_DIGIT = /^#([0-9a-f]{6})$/i;
const THREE_DIGIT = /^#([0-9a-f]{3})$/i;

/** One sRGB channel, 0..255, linearized by the WCAG 2.1 piecewise curve. */
function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/**
 * Relative luminance of a hex colour. Accepts `#rgb` and `#rrggbb` only: an alpha
 * channel or a colour keyword would give a number that looks valid but is not, so it
 * throws instead.
 */
function luminance(hex: string): number {
  const colour = hex.trim();
  const six = SIX_DIGIT.exec(colour);
  const three = THREE_DIGIT.exec(colour);
  let digits: string;
  if (six !== null) {
    digits = six[1];
  } else if (three !== null) {
    digits = three[1].replace(/./g, (d) => d + d);
  } else {
    throw new Error(`not a three or six digit hex colour: ${hex}`);
  }
  const n = Number.parseInt(digits, 16);
  return (
    0.2126 * channel((n >> 16) & 0xff) +
    0.7152 * channel((n >> 8) & 0xff) +
    0.0722 * channel(n & 0xff)
  );
}

/** Contrast ratio between two hex colours, from 1 to 21. The order does not matter. */
export function contrastRatio(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  const [lighter, darker] = a > b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}
