import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { shapeOf, shapeOfMockup } from './dom-shape';

function build(html: string): Element {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host.firstElementChild as Element;
}

describe('shapeOf', () => {
  it('records tag, depth and order', () => {
    expect(shapeOf(build('<aside><nav><a></a><a></a></nav></aside>'))).toEqual([
      'aside',
      '  nav',
      '    a',
      '    a',
    ]);
  });

  it('records the ARIA role when one is set, because that is the contract', () => {
    expect(shapeOf(build('<div role="navigation"><ul></ul></div>'))).toEqual([
      'div[navigation]',
      '  ul',
    ]);
  });

  it('ignores classes, so restyling does not break the test', () => {
    const a = shapeOf(build('<section class="p-4 bg-surface"><p></p></section>'));
    const b = shapeOf(build('<section class="totally different"><p></p></section>'));
    expect(a).toEqual(b);
  });

  it('notices a missing element', () => {
    const want = shapeOf(build('<header><h1></h1><button></button></header>'));
    const got = shapeOf(build('<header><h1></h1></header>'));
    expect(got).not.toEqual(want);
  });

  it('notices two siblings swapped', () => {
    const want = shapeOf(build('<div><nav></nav><main></main></div>'));
    const got = shapeOf(build('<div><main></main><nav></nav></div>'));
    expect(got).not.toEqual(want);
  });

  it('notices a change of nesting', () => {
    const want = shapeOf(build('<div><nav></nav><main></main></div>'));
    const got = shapeOf(build('<div><nav><main></main></nav></div>'));
    expect(got).not.toEqual(want);
  });

  it('treats a Material Symbols ligature span and an svg as the same icon', () => {
    const mockup = shapeOf(
      build('<button><span class="material-symbols-outlined">add</span></button>'),
    );
    const rendered = shapeOf(build('<button><svg><path d=""></path></svg></button>'));
    expect(mockup).toEqual(['button']);
    expect(rendered).toEqual(mockup);
  });

  it('keeps an ordinary span, because it can be a real region', () => {
    expect(shapeOf(build('<p><span class="text-fg">x</span></p>'))).toEqual(['p', '  span']);
  });

  it('starts indentation at the given depth', () => {
    expect(shapeOf(build('<aside><nav></nav></aside>'), 1)).toEqual(['  aside', '    nav']);
  });
});

describe('shapeOfMockup', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dom-shape-'));
  const file = join(dir, 'mockup.html');
  writeFileSync(
    file,
    `<!DOCTYPE html>
<html class="dark"><head><title>t</title><script>var x = 1;</script></head>
<body class="bg-bg"><aside><nav><a><span class="material-symbols-outlined">home</span></a></nav></aside><main></main></body></html>`,
  );
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('finds an element by tag inside the mockup', () => {
    expect(shapeOfMockup(file, 'aside')).toEqual(['aside', '  nav', '    a']);
  });

  it('can select body, because the document is parsed whole', () => {
    expect(shapeOfMockup(file, 'body')).toEqual(['body', '  aside', '    nav', '      a', '  main']);
  });

  it('can select the html root and skips script', () => {
    const lines = shapeOfMockup(file, 'html');
    expect(lines[0]).toBe('html');
    expect(lines).toContain('  head');
    expect(lines.some((l) => l.includes('script'))).toBe(false);
  });

  it('throws when the selector matches nothing', () => {
    expect(() => shapeOfMockup(file, 'footer')).toThrow(/No footer in/);
  });
});
