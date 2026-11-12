import { describe, expect, it } from 'vitest';

import { parseInline, parseMarkdown, safeHref } from './markdown';

describe('safe Markdown reader', () => {
  it('keeps raw HTML as text', () => {
    expect(parseInline('<img src=x onerror=alert(1)>')).toEqual([
      { kind: 'text', text: '<img src=x onerror=alert(1)>' },
    ]);
  });

  it('follows only http, https and mailto links', () => {
    expect(safeHref('https://example.com/a')).toBe('https://example.com/a');
    expect(safeHref('mailto:sec@example.com')).toBe('mailto:sec@example.com');
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref(' JaVaScRiPt:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,<script>')).toBeNull();
    expect(safeHref('/relative')).toBeNull();
    expect(parseInline('[x](javascript:alert(1))')).toEqual([{ kind: 'text', text: 'x' }]);
    expect(parseInline('[docs](https://example.com)')).toEqual([
      { kind: 'link', href: 'https://example.com/', children: [{ kind: 'text', text: 'docs' }] },
    ]);
  });

  it('reads inline code, strong, emphasis and escapes', () => {
    expect(parseInline('a `<b>` **c** *d* \\*e')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'code', text: '<b>' },
      { kind: 'text', text: ' ' },
      { kind: 'strong', children: [{ kind: 'text', text: 'c' }] },
      { kind: 'text', text: ' ' },
      { kind: 'em', children: [{ kind: 'text', text: 'd' }] },
      { kind: 'text', text: ' *e' },
    ]);
  });

  it('reads blocks, with a fence longer than the backticks inside', () => {
    const source = [
      '# Title',
      '',
      'One',
      'line.',
      '',
      '- a',
      '- b',
      '',
      '1. first',
      '',
      '> quoted',
      '',
      '---',
      '````text',
      '```',
      '<script>alert(1)</script>',
      '````',
    ].join('\n');
    expect(parseMarkdown(source)).toEqual([
      { kind: 'heading', level: 1, children: [{ kind: 'text', text: 'Title' }] },
      { kind: 'paragraph', children: [{ kind: 'text', text: 'One line.' }] },
      {
        kind: 'list',
        ordered: false,
        items: [[{ kind: 'text', text: 'a' }], [{ kind: 'text', text: 'b' }]],
      },
      { kind: 'list', ordered: true, items: [[{ kind: 'text', text: 'first' }]] },
      {
        kind: 'quote',
        children: [{ kind: 'paragraph', children: [{ kind: 'text', text: 'quoted' }] }],
      },
      { kind: 'rule' },
      { kind: 'code', text: '```\n<script>alert(1)</script>' },
    ]);
  });
});
