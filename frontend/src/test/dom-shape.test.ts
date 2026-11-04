import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

  it('does not skip an icon-classed span that has children', () => {
    expect(shapeOf(build('<p><span class="material-symbols-outlined"><b></b></span></p>'))).toEqual(
      ['p', '  span', '    b'],
    );
  });

  it('matches the icon class as a whole token, not a substring', () => {
    expect(shapeOf(build('<p><span class="no-material-symbols-outlined-fix"></span></p>'))).toEqual(
      ['p', '  span'],
    );
  });

  it('treats an empty aria-hidden span as decoration, but not one with text', () => {
    expect(shapeOf(build('<p><span aria-hidden="true"></span></p>'))).toEqual(['p']);
    expect(shapeOf(build('<p><span aria-hidden="true">x</span></p>'))).toEqual(['p', '  span']);
  });

  it('starts indentation at the given depth', () => {
    expect(shapeOf(build('<aside><nav></nav></aside>'), 1)).toEqual(['  aside', '    nav']);
  });
});

describe('shapeOf in landmark mode', () => {
  const landmarks = { landmarks: true };

  it('collapses wrappers and re-parents their children', () => {
    const html = '<div class="a"><div class="b"><nav><a></a></nav></div><main></main></div>';
    expect(shapeOf(build(html), 0, landmarks)).toEqual(['div', '  nav', '    a', '  main']);
  });

  it('gives the same shape with or without framework wrappers', () => {
    const plain = build('<div><aside><nav><a></a></nav></aside><main></main></div>');
    const wrapped = build(
      '<div><div><aside><div><nav><span><a></a></span></nav></div></aside></div><div><main></main></div></div>',
    );
    expect(shapeOf(wrapped, 0, landmarks)).toEqual(shapeOf(plain, 0, landmarks));
  });

  it('keeps an element that carries a role', () => {
    expect(shapeOf(build('<div><div role="tablist"></div></div>'), 0, landmarks)).toEqual([
      'div',
      '  div[tablist]',
    ]);
  });

  it('still notices swapped and missing landmarks', () => {
    const want = shapeOf(build('<div><nav></nav><main></main></div>'), 0, landmarks);
    expect(shapeOf(build('<div><main></main><nav></nav></div>'), 0, landmarks)).not.toEqual(want);
    expect(shapeOf(build('<div><nav></nav></div>'), 0, landmarks)).not.toEqual(want);
  });

  it('is off by default, so strict mode still records wrappers', () => {
    expect(shapeOf(build('<div><div><nav></nav></div></div>'))).toEqual([
      'div',
      '  div',
      '    nav',
    ]);
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
    expect(shapeOfMockup(file, 'body')).toEqual([
      'body',
      '  aside',
      '    nav',
      '      a',
      '  main',
    ]);
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

describe('shapeOfMockup on the real s12 mockup', () => {
  const s12 = join(__dirname, '../../../docs/design/screens/s12-users-access-control.html');
  const dir = mkdtempSync(join(tmpdir(), 'dom-shape-s12-'));
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('notices the aside moved after the content', () => {
    const doc = new DOMParser().parseFromString(readFileSync(s12, 'utf8'), 'text/html');
    const aside = doc.querySelector('aside');
    if (aside === null) throw new Error('s12 has no aside');
    doc.body.append(aside);
    const mutated = join(dir, 's12-mutated.html');
    writeFileSync(mutated, doc.documentElement.outerHTML);

    const options = { landmarks: true };
    const want = shapeOfMockup(s12, 'body', 0, options);
    const got = shapeOfMockup(mutated, 'body', 0, options);
    expect(want[1]).toBe('  aside');
    expect(got).not.toEqual(want);
    expect(got.length).toBe(want.length);
  });
});
