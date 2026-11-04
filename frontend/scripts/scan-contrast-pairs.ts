/**
 * Finds the foreground/background token pairs the screens really paint, by reading the
 * source instead of trusting a hand-written list.
 *
 * The contrast test used to iterate a list someone maintained by hand, so it could only
 * fail for pairs that list already carried: the primary button measured 1.22:1 in the
 * light theme for the whole of part A without a single red test. This module closes that
 * gap. It parses every `.tsx` under `src/` with the TypeScript parser, resolves each
 * `className` expression (template literals, `+` concatenation, ternaries, module-level
 * constants, lookup tables) down to the class strings that can reach the DOM, then pairs
 * every `text-*` colour with the `bg-*` colour behind it, walking up the JSX tree when
 * the element itself sets no background.
 *
 * Known limits, both covered by the hand list in src/styles/contrast-pairs.ts:
 * the walk stops at the top of a file, so a background a *parent component* paints is
 * invisible here, and a colour set through the `style` attribute is not a class at all.
 */
import { globSync, readFileSync } from 'node:fs';
import { relative } from 'node:path';

import ts from 'typescript';

/** One colour pair a component paints, with the interaction state it is painted in. */
export interface RenderedPair {
  /** Token name of the text or icon colour, for example `color-accent-ink`. */
  readonly foreground: string;
  /** Token name of the fill behind it, for example `color-primary-container`. */
  readonly background: string;
  /** Tailwind variant both sides are read in: the empty string is the resting state. */
  readonly state: string;
  /** `file:line` of the element that sets the foreground. */
  readonly where: string;
}

/** Class names split by the Tailwind variant they are prefixed with. */
interface ClassSet {
  /** Variant (empty string for the resting state) to colour token name. */
  readonly foregrounds: Map<string, string>;
  readonly backgrounds: Map<string, string>;
}

/** An element on the JSX ancestor chain, nearest first. */
interface Frame {
  readonly classes: ClassSet;
}

// A ternary inside a lookup table inside a template literal multiplies out fast; the
// screens never need more than a handful of alternatives, so cap it rather than hang.
const MAX_ALTERNATIVES = 64;

/**
 * Splits `aria-[current=page]:bg-accent-soft` into its variant prefix and the class
 * itself. A colon inside square brackets belongs to the variant's argument, not to the
 * prefix separator.
 */
function splitVariant(className: string): { state: string; base: string } {
  let depth = 0;
  let lastColon = -1;
  for (let i = 0; i < className.length; i++) {
    const c = className[i];
    if (c === '[') depth++;
    else if (c === ']') depth--;
    else if (c === ':' && depth === 0) lastColon = i;
  }
  if (lastColon === -1) return { state: '', base: className };
  return { state: className.slice(0, lastColon), base: className.slice(lastColon + 1) };
}

/** Reads one class string into the colour tokens it sets, keyed by variant. */
function readClasses(classString: string, isColourToken: (token: string) => boolean): ClassSet {
  const foregrounds = new Map<string, string>();
  const backgrounds = new Map<string, string>();
  for (const className of classString.split(/\s+/)) {
    if (className === '') continue;
    const { state, base } = splitVariant(className);
    // An opacity modifier (`bg-surface/50`) or an arbitrary value is not a plain token.
    if (base.includes('/') || base.includes('[')) continue;
    const target = base.startsWith('text-')
      ? foregrounds
      : base.startsWith('bg-')
        ? backgrounds
        : undefined;
    if (target === undefined) continue;
    const token = `color-${base.slice(base.indexOf('-') + 1)}`;
    // `text-caption` is a type scale and `bg-gradient-to-r` is not a colour: only names
    // the Token Table knows as colours survive this check.
    if (!isColourToken(token)) continue;
    // Tailwind's later class wins; keeping the first is close enough and stays stable.
    if (!target.has(state)) target.set(state, token);
  }
  return { foregrounds, backgrounds };
}

/** Every string a `className` expression can evaluate to. */
class Resolver {
  private readonly constants = new Map<string, ts.Expression>();
  private readonly resolving = new Set<string>();

  constructor(source: ts.SourceFile) {
    const collect = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        this.constants.set(node.name.text, node.initializer);
      }
      ts.forEachChild(node, collect);
    };
    collect(source);
  }

  /** The alternatives an expression can produce, deduplicated and capped. */
  resolve(node: ts.Expression | undefined): string[] {
    if (node === undefined) return [''];
    return [...new Set(this.evaluate(node))].slice(0, MAX_ALTERNATIVES);
  }

  private evaluate(node: ts.Expression): string[] {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) {
      return this.evaluate(node.expression);
    }
    if (ts.isJsxExpression(node)) return this.resolve(node.expression);
    if (ts.isTemplateExpression(node)) {
      let out = [node.head.text];
      for (const span of node.templateSpans) {
        out = this.join(out, this.evaluate(span.expression));
        out = out.map((text) => text + span.literal.text);
      }
      return out;
    }
    if (ts.isBinaryExpression(node)) {
      const kind = node.operatorToken.kind;
      if (kind === ts.SyntaxKind.PlusToken) {
        return this.join(this.evaluate(node.left), this.evaluate(node.right));
      }
      // `A ?? B` and `A || B` both render one side or the other.
      if (
        kind === ts.SyntaxKind.QuestionQuestionToken ||
        kind === ts.SyntaxKind.BarBarToken ||
        kind === ts.SyntaxKind.AmpersandAmpersandToken
      ) {
        return [...this.evaluate(node.left), ...this.evaluate(node.right)];
      }
      return [''];
    }
    if (ts.isConditionalExpression(node)) {
      return [...this.evaluate(node.whenTrue), ...this.evaluate(node.whenFalse)];
    }
    if (ts.isIdentifier(node)) return this.lookup(node.text);
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      return this.evaluate(node.expression).length > 0 ? this.members(node.expression) : [''];
    }
    if (ts.isObjectLiteralExpression(node)) {
      // A lookup table of class strings: any entry can be the one that renders.
      return node.properties.flatMap((property) =>
        ts.isPropertyAssignment(property) ? this.evaluate(property.initializer) : [''],
      );
    }
    return [''];
  }

  /** Alternatives of a lookup table reached through `TABLE[key]` or `TABLE.key`. */
  private members(target: ts.Expression): string[] {
    if (!ts.isIdentifier(target)) return [''];
    return this.lookup(target.text);
  }

  private lookup(name: string): string[] {
    const initializer = this.constants.get(name);
    if (initializer === undefined || this.resolving.has(name)) return [''];
    this.resolving.add(name);
    try {
      return this.evaluate(initializer);
    } finally {
      this.resolving.delete(name);
    }
  }

  private join(left: string[], right: string[]): string[] {
    const out: string[] = [];
    for (const a of left) {
      for (const b of right) {
        if (out.length >= MAX_ALTERNATIVES) return out;
        out.push(a + b);
      }
    }
    return out;
  }
}

/** The `className` attribute of an opening tag, or undefined when it has none. */
function classNameExpression(
  element: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
): ts.Expression | undefined {
  for (const attribute of element.attributes.properties) {
    if (!ts.isJsxAttribute(attribute)) continue;
    if (attribute.name.getText() !== 'className') continue;
    const value = attribute.initializer;
    if (value === undefined) return undefined;
    if (ts.isStringLiteral(value)) return value;
    if (ts.isJsxExpression(value)) return value.expression;
  }
  return undefined;
}

/**
 * The fills visible behind an element, keyed by the variant that reveals them. The walk
 * goes from the element outwards and stops at the first opaque resting background,
 * because a nearer fill hides everything behind it.
 */
function backdrops(chain: readonly Frame[]): Map<string, string> {
  const found = new Map<string, string>();
  for (let i = chain.length - 1; i >= 0; i--) {
    const { backgrounds } = chain[i].classes;
    for (const [state, token] of backgrounds) {
      if (state !== '' && !found.has(state)) found.set(state, token);
    }
    const resting = backgrounds.get('');
    if (resting !== undefined) {
      if (!found.has('')) found.set('', resting);
      break;
    }
  }
  return found;
}

/** Pairs one element's text colours with the fills behind them. */
function pairsFor(chain: readonly Frame[], where: string): RenderedPair[] {
  const { foregrounds } = chain[chain.length - 1].classes;
  if (foregrounds.size === 0) return [];
  const behind = backdrops(chain);
  const out: RenderedPair[] = [];
  for (const [textState, foreground] of foregrounds) {
    for (const [fillState, background] of behind) {
      // Text set for a state is read in that state, or over the resting fill.
      if (textState !== '' && fillState !== '' && fillState !== textState) continue;
      // While a state has its own text colour, the resting colour is not the one on show.
      if (textState === '' && fillState !== '' && foregrounds.has(fillState)) continue;
      out.push({ foreground, background, state: textState || fillState, where });
    }
  }
  return out;
}

/** Scans one file and returns every pair its JSX paints. */
function scanFile(
  path: string,
  label: string,
  isColourToken: (token: string) => boolean,
): RenderedPair[] {
  const code = readFileSync(path, 'utf8');
  const source = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const resolver = new Resolver(source);
  const pairs: RenderedPair[] = [];

  const frameFor = (element: ts.JsxOpeningElement | ts.JsxSelfClosingElement): Frame[] => {
    const alternatives = resolver.resolve(classNameExpression(element));
    return alternatives.map((classString) => ({
      classes: readClasses(classString, isColourToken),
    }));
  };

  const visit = (node: ts.Node, chain: readonly Frame[]): void => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const line = source.getLineAndCharacterOfPosition(opening.getStart(source)).line + 1;
      const where = `${label}:${line}`;
      for (const frame of frameFor(opening)) {
        const here = [...chain, frame];
        pairs.push(...pairsFor(here, where));
        if (ts.isJsxElement(node)) {
          for (const child of node.children) visit(child, here);
        }
      }
      // Attributes can hold more JSX (for example an icon passed as a prop).
      for (const attribute of opening.attributes.properties) visit(attribute, chain);
      return;
    }
    ts.forEachChild(node, (child) => visit(child, chain));
  };

  visit(source, []);
  return pairs;
}

/** Every text colour token an element sets, whatever is or is not behind it. */
function scanFileForegrounds(
  path: string,
  label: string,
  isColourToken: (token: string) => boolean,
): Map<string, string> {
  const code = readFileSync(path, 'utf8');
  const source = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const resolver = new Resolver(source);
  const found = new Map<string, string>();
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      for (const classString of resolver.resolve(classNameExpression(node))) {
        for (const token of readClasses(classString, isColourToken).foregrounds.values()) {
          if (!found.has(token)) found.set(token, `${label}:${line}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** The `.tsx` files that make up the interface: generated modules and tests are not screens. */
function screenFiles(root: string): string[] {
  return globSync('**/*.tsx', { cwd: root })
    .filter((file) => !file.includes('.test.') && !file.includes('.generated.'))
    .sort();
}

/**
 * Every pair the screens under `root` paint, deduplicated by colour pair and state and
 * sorted, with the first place each one is rendered.
 */
export function scanRenderedPairs(root: string, colourTokens: readonly string[]): RenderedPair[] {
  const known = new Set(colourTokens);
  const isColourToken = (token: string): boolean => known.has(token);
  const seen = new Map<string, RenderedPair>();
  for (const file of screenFiles(root)) {
    const path = `${root}/${file}`;
    for (const pair of scanFile(path, relative(root, path), isColourToken)) {
      const key = `${pair.foreground}|${pair.background}|${pair.state}`;
      if (!seen.has(key)) seen.set(key, pair);
    }
  }
  return [...seen.values()].sort((a, b) =>
    `${a.foreground}|${a.background}|${a.state}`.localeCompare(
      `${b.foreground}|${b.background}|${b.state}`,
    ),
  );
}

/**
 * Every text colour token the screens set, mapped to the first `file:line` that sets it.
 * A token here that never turns up in `scanRenderedPairs` is painted on a background this
 * module cannot see, so the hand list has to carry it.
 */
export function scanPaintedForegrounds(
  root: string,
  colourTokens: readonly string[],
): Map<string, string> {
  const known = new Set(colourTokens);
  const isColourToken = (token: string): boolean => known.has(token);
  const found = new Map<string, string>();
  for (const file of screenFiles(root)) {
    const path = `${root}/${file}`;
    for (const [token, where] of scanFileForegrounds(path, relative(root, path), isColourToken)) {
      if (!found.has(token)) found.set(token, where);
    }
  }
  return new Map([...found.entries()].sort(([a], [b]) => a.localeCompare(b)));
}
