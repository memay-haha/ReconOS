/** A small Markdown reader for report bodies. It builds a tree of plain strings that React
 * renders as text, so nothing in the source ever becomes HTML: a `<script>` or an `<img
 * onerror>` quoted from raw output shows as the characters it is (.claude/rules/security.md).
 *
 * Covered: ATX headings, fenced code, lists, block quotes, rules, paragraphs, and inline code,
 * strong, emphasis and links. Raw HTML is never interpreted. A link keeps its target only for
 * http, https and mailto; any other scheme, `javascript:` included, renders as plain text. */

export type Inline =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'code'; readonly text: string }
  | { readonly kind: 'strong'; readonly children: readonly Inline[] }
  | { readonly kind: 'em'; readonly children: readonly Inline[] }
  | { readonly kind: 'link'; readonly href: string; readonly children: readonly Inline[] };

export type Block =
  | {
      readonly kind: 'heading';
      readonly level: 1 | 2 | 3 | 4 | 5 | 6;
      readonly children: readonly Inline[];
    }
  | { readonly kind: 'paragraph'; readonly children: readonly Inline[] }
  | { readonly kind: 'code'; readonly text: string }
  | {
      readonly kind: 'list';
      readonly ordered: boolean;
      readonly items: readonly (readonly Inline[])[];
    }
  | { readonly kind: 'quote'; readonly children: readonly Block[] }
  | { readonly kind: 'rule' };

const SAFE_SCHEMES = new Set(['http:', 'https:', 'mailto:']);

/** The link target when its scheme is allowed, null otherwise. Relative links are refused too:
 * a report is read on the platform, where a relative path means nothing. */
export function safeHref(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    return SAFE_SCHEMES.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

const ESCAPABLE = new Set('\\`*_{}[]()#+-.!|<>~'.split(''));

function pushText(out: Inline[], text: string): void {
  if (text === '') return;
  const last = out[out.length - 1];
  if (last !== undefined && last.kind === 'text') {
    out[out.length - 1] = { kind: 'text', text: last.text + text };
  } else {
    out.push({ kind: 'text', text });
  }
}

/** The index of the closing `]` of a link label opened at `start`, or -1. */
function closingBracket(source: string, start: number): number {
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (char === '\\') {
      i += 1;
    } else if (char === '[') {
      depth += 1;
    } else if (char === ']') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** The index of the `)` closing the link target opened at `start`, parentheses balanced, or -1. */
function closingParen(source: string, start: number): number {
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === '(') depth += 1;
    else if (source[i] === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  let i = 0;
  while (i < source.length) {
    const char = source[i] ?? '';
    const rest = source.slice(i);
    if (char === '\\' && ESCAPABLE.has(source[i + 1] ?? '')) {
      pushText(out, source[i + 1] ?? '');
      i += 2;
      continue;
    }
    if (char === '`') {
      const run = /^`+/.exec(rest)?.[0] ?? '`';
      const end = source.indexOf(run, i + run.length);
      if (end !== -1) {
        out.push({ kind: 'code', text: source.slice(i + run.length, end).trim() });
        i = end + run.length;
        continue;
      }
      pushText(out, run);
      i += run.length;
      continue;
    }
    if (rest.startsWith('**') || rest.startsWith('__')) {
      const marker = rest.slice(0, 2);
      const end = source.indexOf(marker, i + 2);
      if (end > i + 2) {
        out.push({ kind: 'strong', children: parseInline(source.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if (char === '*' || char === '_') {
      const end = source.indexOf(char, i + 1);
      if (end > i + 1 && source[i + 1] !== ' ') {
        out.push({ kind: 'em', children: parseInline(source.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    if (char === '[') {
      const close = closingBracket(source, i);
      if (close !== -1 && source[close + 1] === '(') {
        const end = closingParen(source, close + 1);
        if (end !== -1) {
          const label = parseInline(source.slice(i + 1, close));
          const href = safeHref(source.slice(close + 2, end));
          if (href !== null) {
            out.push({ kind: 'link', href, children: label });
          } else {
            // The label stays readable; the refused target is dropped, never followed.
            for (const part of label) {
              if (part.kind === 'text') pushText(out, part.text);
              else out.push(part);
            }
          }
          i = end + 1;
          continue;
        }
      }
    }
    pushText(out, char);
    i += 1;
  }
  return out;
}

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const BULLET = /^\s{0,3}[-*+]\s+(.*)$/;
const ORDERED = /^\s{0,3}\d{1,9}[.)]\s+(.*)$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;

function startsBlock(line: string): boolean {
  return (
    HEADING.test(line) ||
    FENCE.test(line) ||
    RULE.test(line) ||
    BULLET.test(line) ||
    ORDERED.test(line) ||
    QUOTE.test(line)
  );
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (line.trim() === '') {
      i += 1;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence !== null) {
      const marker = fence[1] ?? '```';
      const body: string[] = [];
      i += 1;
      while (i < lines.length) {
        const inner = lines[i] ?? '';
        const close = FENCE.exec(inner);
        if (
          close !== null &&
          (close[1] ?? '')[0] === marker[0] &&
          (close[1] ?? '').length >= marker.length &&
          inner.trim() === close[1]
        ) {
          i += 1;
          break;
        }
        body.push(inner);
        i += 1;
      }
      blocks.push({ kind: 'code', text: body.join('\n') });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading !== null) {
      const level = (heading[1] ?? '#').length as 1 | 2 | 3 | 4 | 5 | 6;
      blocks.push({ kind: 'heading', level, children: parseInline(heading[2] ?? '') });
      i += 1;
      continue;
    }
    if (RULE.test(line)) {
      blocks.push({ kind: 'rule' });
      i += 1;
      continue;
    }
    if (QUOTE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i] ?? '')) {
        inner.push(QUOTE.exec(lines[i] ?? '')?.[1] ?? '');
        i += 1;
      }
      blocks.push({ kind: 'quote', children: parseMarkdown(inner.join('\n')) });
      continue;
    }
    const ordered = ORDERED.test(line);
    if (ordered || BULLET.test(line)) {
      const pattern = ordered ? ORDERED : BULLET;
      const items: Inline[][] = [];
      while (i < lines.length && pattern.test(lines[i] ?? '')) {
        items.push(parseInline(pattern.exec(lines[i] ?? '')?.[1] ?? ''));
        i += 1;
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }
    const text: string[] = [];
    while (i < lines.length && (lines[i] ?? '').trim() !== '' && !startsBlock(lines[i] ?? '')) {
      text.push((lines[i] ?? '').trim());
      i += 1;
    }
    blocks.push({ kind: 'paragraph', children: parseInline(text.join(' ')) });
  }
  return blocks;
}
