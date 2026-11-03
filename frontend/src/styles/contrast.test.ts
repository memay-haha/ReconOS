// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { contrastRatio } from './contrast';

describe('contrastRatio', () => {
  it('returns 21 for black against white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 10);
  });

  it('is symmetric: the order of the two colours does not matter', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 10);
  });

  it('returns 1 for a colour against itself', () => {
    expect(contrastRatio('#22d3ee', '#22d3ee')).toBeCloseTo(1, 10);
  });

  it('weights the red channel by 0.2126', () => {
    // 1.05 / (0.2126 + 0.05), the published ratio for #ff0000 on #ffffff.
    expect(contrastRatio('#ff0000', '#ffffff')).toBeCloseTo(3.9985, 4);
  });

  it('weights the green channel by 0.7152', () => {
    // 1.05 / (0.7152 + 0.05), the published ratio for #00ff00 on #ffffff.
    expect(contrastRatio('#00ff00', '#ffffff')).toBeCloseTo(1.3722, 4);
  });

  it('linearizes the blue channel before weighting it by 0.0722', () => {
    // 1.05 / (0.0722 + 0.05). Skipping the linearization on blue alone still passes
    // the two tests above, so this pair guards it.
    expect(contrastRatio('#0000ff', '#ffffff')).toBeCloseTo(8.5925, 4);
  });

  it('applies the low end of the piecewise curve below 0.03928', () => {
    // #010101 sits under the threshold on every channel, so c / 12.92 decides it:
    // (1 / 255 / 12.92 + 0.05) / 0.05.
    expect(contrastRatio('#010101', '#000000')).toBeCloseTo(1.00607, 5);
  });

  it('reads three digit hex as the doubled six digit form', () => {
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(contrastRatio('#ffffff', '#000000'), 10);
  });

  it('ignores surrounding whitespace and letter case', () => {
    expect(contrastRatio('  #FFFFFF ', '#000000')).toBeCloseTo(21, 10);
  });

  it.each([
    ['a colour name', 'white'],
    ['a missing hash', 'ffffff'],
    ['four digits', '#ffff'],
    ['eight digits with alpha', '#22d3ee66'],
    ['a non hex digit', '#gggggg'],
    ['an empty string', ''],
  ])('throws on %s', (_case, input) => {
    expect(() => contrastRatio(input, '#ffffff')).toThrow();
    expect(() => contrastRatio('#ffffff', input)).toThrow();
  });
});
