/** Test-only helpers for the part B shape tests (S08 to S11). Imported by `*-shape.test.tsx`
 * files only, never by a screen. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { shapeOf } from '@/test/dom-shape';

const SCREENS = resolve(import.meta.dirname, '../../../../../docs/design/screens');

export function mockupDocument(file: string): Document {
  return new DOMParser().parseFromString(readFileSync(resolve(SCREENS, file), 'utf8'), 'text/html');
}

export function textOf(node: Element): string {
  return (node.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Removes every match. Throws when nothing matches: an exclusion that no longer applies
 * must be deleted, not left behind as a silent no-op. */
export function cut(root: Element, selector: string, reason: string): void {
  const hits = Array.from(root.querySelectorAll(selector));
  if (hits.length === 0) throw new Error(`Exclusion matches nothing (${reason}): ${selector}`);
  hits.forEach((hit) => hit.remove());
}

/** Removes the closest `container` around each element of `selector` whose text matches. */
export function cutAround(
  root: Element,
  selector: string,
  text: string | RegExp,
  container: string,
  reason: string,
): void {
  const hits = Array.from(root.querySelectorAll(selector)).filter((e) =>
    typeof text === 'string' ? textOf(e) === text : text.test(textOf(e)),
  );
  if (hits.length === 0) throw new Error(`Exclusion matches nothing (${reason}): ${String(text)}`);
  for (const hit of hits) (hit.closest(container) ?? hit).remove();
}

/** Turns the mockup's numbered pager into the `nav` landmark the Pagination component renders. */
export function pagerToNav(pager: Element): void {
  const nav = pager.ownerDocument.createElement('nav');
  pager.replaceWith(nav);
}

/** Regions only: headings, landmarks, tables and their columns, form controls that select.
 * Buttons, links and wrappers are left out, so a restyled card or an extra row action does
 * not fail the test but a moved, missing or extra region does. */
const REGION = /^\s*(h1|h2|h3|nav|form|table|thead|tbody|th|select)(\[|$)/;

export function regionsOf(root: Element): string[] {
  return shapeOf(root, 0, { landmarks: true })
    .slice(1)
    .filter((line) => REGION.test(line))
    .map((line) => line.trim());
}
