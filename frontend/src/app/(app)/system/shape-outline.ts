import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { shapeOf } from '@/test/dom-shape';

/** Test helper for the part E `*-shape.test.tsx` files. Not imported by any screen.
 *
 * The part E mockups draw far more than the product may build (tech-debt items 1, 2, 5, 7,
 * 8, 9 and parts with no endpoint), so the comparison runs on the outline of each screen:
 * the headings, tables and column headers, in document order. The tag sequence comes from
 * `shapeOf` in landmark mode; each entry carries its text so that a dropped or renamed part
 * is named in the test, with its reason, rather than hidden in a count. */

const OUTLINE_TAGS = new Set(['h1', 'h2', 'h3', 'table', 'th']);

export interface OutlineEntry {
  readonly tag: string;
  readonly text: string;
}

function textOf(node: Element): string {
  return (node.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export function outline(root: Element): OutlineEntry[] {
  const tags = shapeOf(root, 0, { landmarks: true })
    .map((line) => line.trim().split('[')[0] ?? '')
    .filter((tag) => OUTLINE_TAGS.has(tag));
  const nodes = Array.from(root.querySelectorAll('h1, h2, h3, table, th'));
  if (nodes.length !== tags.length) throw new Error('Outline and DOM disagree');
  return tags.map((tag, i) => ({
    tag,
    // A table's text is its whole body; the column headers already speak for it.
    text: tag === 'table' ? '' : textOf(nodes[i] as Element),
  }));
}

export function mockupMain(file: string): Element {
  const path = resolve(import.meta.dirname, '../../../../../docs/design/screens', file);
  const doc = new DOMParser().parseFromString(readFileSync(path, 'utf8'), 'text/html');
  const main = doc.querySelector('main');
  if (main === null) throw new Error(`No main in ${file}`);
  return main;
}

const LEVEL: Readonly<Record<string, number>> = { h1: 1, h2: 2, h3: 3 };

function find(entries: OutlineEntry[], tag: string, text: string, reason: string): number {
  const at = entries.findIndex((e) => e.tag === tag && e.text === text);
  if (at === -1) throw new Error(`Exclusion matches nothing (${reason}): ${tag} ${text}`);
  return at;
}

/** Drops a heading and everything under it, up to the next heading of the same or a higher
 * level. Throws when the heading is gone, so a stale exclusion cannot stay behind. */
export function dropSection(
  entries: OutlineEntry[],
  tag: 'h2' | 'h3',
  text: string,
  reason: string,
): OutlineEntry[] {
  const at = find(entries, tag, text, reason);
  const level = LEVEL[tag] ?? 9;
  let end = at + 1;
  while (end < entries.length && (LEVEL[entries[end]?.tag ?? ''] ?? 9) > level) end += 1;
  return [...entries.slice(0, at), ...entries.slice(end)];
}

/** Renames a heading or column header (M2, M5). */
export function rename(
  entries: OutlineEntry[],
  tag: string,
  from: string,
  to: string,
  reason: string,
): OutlineEntry[] {
  const at = find(entries, tag, from, reason);
  return entries.map((e, i) => (i === at ? { tag, text: to } : e));
}

/** Drops one entry, a column header or a lone heading. */
export function dropEntry(
  entries: OutlineEntry[],
  tag: string,
  text: string,
  reason: string,
): OutlineEntry[] {
  const at = find(entries, tag, text, reason);
  return entries.filter((_, i) => i !== at);
}

/** Inserts entries the documents require and the mockup lacks (M6), after `after`, or at
 * the end when `after` is null. */
export function insertAfter(
  entries: OutlineEntry[],
  after: { tag: string; text: string } | null,
  added: OutlineEntry[],
  reason: string,
): OutlineEntry[] {
  if (after === null) return [...entries, ...added];
  const at = find(entries, after.tag, after.text, reason);
  return [...entries.slice(0, at + 1), ...added, ...entries.slice(at + 1)];
}

export function section(title: string, columns: readonly string[] | null): OutlineEntry[] {
  const head: OutlineEntry[] = [{ tag: 'h2', text: title }];
  if (columns === null) return head;
  return [...head, { tag: 'table', text: '' }, ...columns.map((text) => ({ tag: 'th', text }))];
}
