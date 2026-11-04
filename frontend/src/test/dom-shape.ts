import { readFileSync } from 'node:fs';

/** Elements that carry no structure, only decoration or non-rendered content.
 * Comparing them would make a layout test break on every icon change. */
const SKIP = new Set(['svg', 'path', 'img', 'br', 'script', 'style', 'link', 'meta', 'noscript']);

/** The mockups draw icons as `<span class="material-symbols-outlined">name</span>`
 * (a font ligature) while the app may render an `<svg>`. Both are "an icon".
 * This is the one place to extend if the app marks icons some other way. */
const ICON_CLASSES = new Set([
  'material-symbols-outlined',
  'material-symbols-rounded',
  'material-symbols-sharp',
]);

/** Tags that are structurally meaningful in landmark mode. Any element with a
 * `role` is meaningful too. */
const LANDMARK_TAGS = new Set([
  'aside',
  'nav',
  'header',
  'footer',
  'main',
  'section',
  'article',
  'form',
  'fieldset',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'a',
  'button',
  'input',
  'select',
  'textarea',
  'label',
  'dialog',
]);

export interface ShapeOptions {
  /** Keep only semantic tags and elements with a role; collapse every other
   * wrapper and re-parent its children. Both Tailwind layout divs and framework
   * provider wrappers vanish, leaving the real skeleton. The root is always kept. */
  landmarks?: boolean;
}

/** An icon is a leaf: an icon-classed span with element children may hold real
 * content and is never skipped. */
function isIcon(node: Element, tag: string): boolean {
  if (tag !== 'span' || node.children.length > 0) return false;
  const classes = (node.getAttribute('class') ?? '').split(/\s+/);
  if (classes.some((c) => ICON_CLASSES.has(c))) return true;
  return node.getAttribute('aria-hidden') === 'true' && (node.textContent ?? '').trim() === '';
}

function isDecoration(node: Element, tag: string): boolean {
  return SKIP.has(tag) || isIcon(node, tag);
}

function isLandmark(node: Element, tag: string): boolean {
  return LANDMARK_TAGS.has(tag) || node.hasAttribute('role');
}

/** The structural skeleton of a subtree: tag, nesting depth, sibling order and
 * ARIA role. Classes and text are deliberately left out, so restyling a screen
 * does not fail the test but moving a region does. One indented line per element. */
export function shapeOf(node: Element, depth = 0, options: ShapeOptions = {}): string[] {
  return collect(node, depth, options, true);
}

function collect(node: Element, depth: number, options: ShapeOptions, isRoot: boolean): string[] {
  const tag = node.tagName.toLowerCase();
  if (isDecoration(node, tag)) return [];
  const keep = options.landmarks !== true || isRoot || isLandmark(node, tag);
  const lines: string[] = [];
  if (keep) {
    const role = node.getAttribute('role');
    lines.push(`${'  '.repeat(depth)}${tag}${role === null ? '' : `[${role}]`}`);
  }
  const childDepth = keep ? depth + 1 : depth;
  for (const child of Array.from(node.children)) {
    lines.push(...collect(child, childDepth, options, false));
  }
  return lines;
}

/** Shape of the first element matching `selector` in a mockup file. The file is
 * parsed as a whole document, so `html`, `head` and `body` selectors work. */
export function shapeOfMockup(
  file: string,
  selector: string,
  depth = 0,
  options: ShapeOptions = {},
): string[] {
  const doc = new DOMParser().parseFromString(readFileSync(file, 'utf8'), 'text/html');
  const root = doc.querySelector(selector);
  if (root === null) throw new Error(`No ${selector} in ${file}`);
  return shapeOf(root, depth, options);
}
