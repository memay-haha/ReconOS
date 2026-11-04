import { readFileSync } from 'node:fs';

/** Elements that carry no structure, only decoration or non-rendered content.
 * Comparing them would make a layout test break on every icon change. */
const SKIP = new Set(['svg', 'path', 'img', 'br', 'script', 'style', 'link', 'meta', 'noscript']);

/** The mockups draw icons as `<span class="material-symbols-outlined">name</span>`
 * (a font ligature) while the app may render an `<svg>`. Both are "an icon". */
const ICON_CLASS = 'material-symbols';

function isDecoration(node: Element, tag: string): boolean {
  if (SKIP.has(tag)) return true;
  return tag === 'span' && (node.getAttribute('class') ?? '').includes(ICON_CLASS);
}

/** The structural skeleton of a subtree: tag, nesting depth, sibling order and
 * ARIA role. Classes and text are deliberately left out, so restyling a screen
 * does not fail the test but moving a region does. One indented line per element. */
export function shapeOf(node: Element, depth = 0): string[] {
  const lines: string[] = [];
  const tag = node.tagName.toLowerCase();
  if (isDecoration(node, tag)) return lines;
  const role = node.getAttribute('role');
  lines.push(`${'  '.repeat(depth)}${tag}${role === null ? '' : `[${role}]`}`);
  for (const child of Array.from(node.children)) {
    lines.push(...shapeOf(child, depth + 1));
  }
  return lines;
}

/** Shape of the first element matching `selector` in a mockup file. The file is
 * parsed as a whole document, so `html`, `head` and `body` selectors work. */
export function shapeOfMockup(file: string, selector: string, depth = 0): string[] {
  const doc = new DOMParser().parseFromString(readFileSync(file, 'utf8'), 'text/html');
  const root = doc.querySelector(selector);
  if (root === null) throw new Error(`No ${selector} in ${file}`);
  return shapeOf(root, depth);
}
