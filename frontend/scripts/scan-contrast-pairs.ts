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
 * An expression this module cannot evaluate is never allowed to contribute nothing in
 * silence: the resolver records the node, and `scanUnresolvedClassNames` hands every one to
 * the test as a failure naming the file and line. Call arguments of the class helpers
 * (`cn`, `clsx`, `classnames`, `twMerge`, `twJoin`) are understood; anything else is not.
 *
 * Known limits, both covered by the hand list in src/styles/contrast-pairs.ts:
 * the walk stops at the top of a file, so a background a *parent component* paints is
 * invisible here, and a colour set through the `style` attribute is not a class at all.
 */
import { existsSync, globSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

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

/** Helpers that join their arguments into one class string, so the arguments are the classes. */
const CLASS_HELPERS = new Set(['cn', 'clsx', 'classnames', 'classNames', 'twMerge', 'twJoin']);

/** A `className` piece the resolver could not evaluate, with where it sits. */
export interface UnresolvedClassName {
  /** `file:line` of the expression. */
  readonly where: string;
  /** The source text of the expression the resolver gave up on. */
  readonly expression: string;
}

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

/** What the resolvers of one scan share: the `src` root and one resolver per file read. */
interface ScanContext {
  readonly root: string;
  readonly files: Map<string, Resolver | undefined>;
}

function newContext(root: string): ScanContext {
  return { root, files: new Map() };
}

/** Parses a file once and hands back its resolver, or undefined when it does not exist. */
function resolverFor(path: string, context: ScanContext): Resolver | undefined {
  if (context.files.has(path)) return context.files.get(path);
  context.files.set(path, undefined);
  if (!existsSync(path)) return undefined;
  const code = readFileSync(path, 'utf8');
  const source = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const created = new Resolver(source, context);
  context.files.set(path, created);
  return created;
}

/** Every string a `className` expression can evaluate to. */
class Resolver {
  private readonly constants = new Map<string, ts.Expression>();
  /** Local name to the module it is imported from and the name it has there. */
  private readonly imports = new Map<string, { specifier: string; name: string }>();
  /** Values that are class names carrying no colour, such as a `next/font` variable. */
  private readonly inert = new Set<string>();
  private readonly resolving = new Set<string>();
  /** Nodes `evaluate` could not understand since the last `takeUnresolved`. */
  private unresolved: ts.Node[] = [];

  constructor(
    private readonly source: ts.SourceFile,
    private readonly context: ScanContext,
  ) {
    const fontFactories = new Set<string>();
    const collect = (node: ts.Node): void => {
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        node.importClause?.namedBindings !== undefined &&
        ts.isNamedImports(node.importClause.namedBindings)
      ) {
        const specifier = node.moduleSpecifier.text;
        for (const element of node.importClause.namedBindings.elements) {
          const name = (element.propertyName ?? element.name).text;
          this.imports.set(element.name.text, { specifier, name });
          if (specifier.startsWith('next/font')) fontFactories.add(element.name.text);
        }
      }
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        this.constants.set(node.name.text, node.initializer);
        const call = node.initializer;
        if (
          ts.isCallExpression(call) &&
          ts.isIdentifier(call.expression) &&
          fontFactories.has(call.expression.text)
        ) {
          this.inert.add(node.name.text);
        }
      }
      ts.forEachChild(node, collect);
    };
    collect(source);
  }

  /** The file an import specifier points at, for the project's own modules only. */
  private pathOf(specifier: string): string | undefined {
    const base = specifier.startsWith('@/')
      ? resolve(this.context.root, specifier.slice(2))
      : specifier.startsWith('.')
        ? resolve(dirname(this.source.fileName), specifier)
        : undefined;
    if (base === undefined) return undefined;
    return ['.ts', '.tsx', '/index.ts', '/index.tsx']
      .map((suffix) => base + suffix)
      .find((candidate) => existsSync(candidate));
  }

  /** What a constant imported from another project file evaluates to. */
  private imported(name: string, at: ts.Node): string[] {
    const from = this.imports.get(name);
    const path = from === undefined ? undefined : this.pathOf(from.specifier);
    const other = path === undefined ? undefined : resolverFor(path, this.context);
    if (from === undefined || other === undefined) return this.giveUp(at);
    const values = other.lookup(from.name, at);
    // Nodes in the other file cannot be named here, so report the use site instead.
    if (other.takeUnresolved().length > 0) return this.giveUp(at);
    return values;
  }

  /** The alternatives an expression can produce, deduplicated and capped. */
  resolve(node: ts.Expression | undefined): string[] {
    if (node === undefined) return [''];
    return [...new Set(this.evaluate(node))].slice(0, MAX_ALTERNATIVES);
  }

  /** The nodes that evaluated to nothing for lack of understanding, then forgets them. */
  takeUnresolved(): ts.Node[] {
    const taken = this.unresolved;
    this.unresolved = [];
    return taken;
  }

  /** Records a node as not understood and stands in an empty string for it. */
  private giveUp(node: ts.Node): string[] {
    this.unresolved.push(node);
    return [''];
  }

  private evaluate(node: ts.Expression): string[] {
    // Values that render no class: `cond && 'x'` when cond is false, `null`, numbers.
    if (
      node.kind === ts.SyntaxKind.NullKeyword ||
      node.kind === ts.SyntaxKind.FalseKeyword ||
      node.kind === ts.SyntaxKind.TrueKeyword ||
      ts.isNumericLiteral(node) ||
      (ts.isIdentifier(node) && node.text === 'undefined')
    ) {
      return [''];
    }
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
      if (kind === ts.SyntaxKind.QuestionQuestionToken || kind === ts.SyntaxKind.BarBarToken) {
        return [...this.evaluate(node.left), ...this.evaluate(node.right)];
      }
      // `A && B` renders B or nothing: the left side is a condition, not a class.
      if (kind === ts.SyntaxKind.AmpersandAmpersandToken) {
        return ['', ...this.evaluate(node.right)];
      }
      return this.giveUp(node);
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      if (CLASS_HELPERS.has(node.expression.text)) return this.helperArguments(node.arguments);
    }
    if (ts.isConditionalExpression(node)) {
      return [...this.evaluate(node.whenTrue), ...this.evaluate(node.whenFalse)];
    }
    if (ts.isIdentifier(node)) return this.lookup(node.text, node);
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      return this.members(node);
    }
    if (ts.isObjectLiteralExpression(node)) {
      // A lookup table of class strings: any entry can be the one that renders.
      return node.properties.flatMap((property) =>
        ts.isPropertyAssignment(property)
          ? this.evaluate(property.initializer)
          : this.giveUp(property),
      );
    }
    return this.giveUp(node);
  }

  /** Arguments of `cn(...)`: strings, conditions, arrays and `{ 'class': condition }` objects. */
  private helperArguments(args: readonly ts.Expression[]): string[] {
    let out = [''];
    for (const arg of args)
      out = this.join(
        out,
        this.helperArgument(arg).map((a) => ` ${a}`),
      );
    return out;
  }

  private helperArgument(arg: ts.Expression): string[] {
    if (ts.isParenthesizedExpression(arg)) return this.helperArgument(arg.expression);
    if (ts.isArrayLiteralExpression(arg)) return this.helperArguments(arg.elements);
    if (ts.isObjectLiteralExpression(arg)) {
      // In a helper the keys are the classes and the values are conditions.
      let out = [''];
      for (const property of arg.properties) {
        const name = ts.isPropertyAssignment(property) ? property.name : undefined;
        const key =
          name !== undefined && (ts.isIdentifier(name) || ts.isStringLiteral(name))
            ? name.text
            : undefined;
        const alternatives = key === undefined ? this.giveUp(property) : ['', ` ${key}`];
        out = this.join(out, alternatives);
      }
      return out;
    }
    if (ts.isConditionalExpression(arg)) {
      return [...this.helperArgument(arg.whenTrue), ...this.helperArgument(arg.whenFalse)];
    }
    if (
      ts.isBinaryExpression(arg) &&
      arg.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
    ) {
      return ['', ...this.helperArgument(arg.right)];
    }
    return this.evaluate(arg);
  }

  /** Alternatives of a lookup table reached through `TABLE[key]` or `TABLE.key`. */
  private members(node: ts.PropertyAccessExpression | ts.ElementAccessExpression): string[] {
    const target = node.expression;
    if (!ts.isIdentifier(target)) return this.giveUp(node);
    return this.lookup(target.text, node);
  }

  lookup(name: string, at: ts.Node): string[] {
    if (this.inert.has(name)) return [''];
    const initializer = this.constants.get(name);
    if (initializer === undefined && this.imports.has(name)) return this.imported(name, at);
    if (initializer === undefined || this.resolving.has(name)) return this.giveUp(at);
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
  context: ScanContext,
): RenderedPair[] {
  const code = readFileSync(path, 'utf8');
  const source = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const resolver = new Resolver(source, context);
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
  context: ScanContext,
): Map<string, string> {
  const code = readFileSync(path, 'utf8');
  const source = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const resolver = new Resolver(source, context);
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

/** Every `className` piece under `root` the resolver could not evaluate, in file order. */
export function scanUnresolvedClassNames(root: string): UnresolvedClassName[] {
  const out: UnresolvedClassName[] = [];
  for (const file of screenFiles(root)) {
    const path = `${root}/${file}`;
    const code = readFileSync(path, 'utf8');
    const source = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const resolver = new Resolver(source, newContext(root));
    const visit = (node: ts.Node): void => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        resolver.resolve(classNameExpression(node));
        for (const bad of resolver.takeUnresolved()) {
          const line = source.getLineAndCharacterOfPosition(bad.getStart(source)).line + 1;
          out.push({ where: `${relative(root, path)}:${line}`, expression: bad.getText(source) });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return out;
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
  const context = newContext(root);
  for (const file of screenFiles(root)) {
    const path = `${root}/${file}`;
    for (const pair of scanFile(path, relative(root, path), isColourToken, context)) {
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
  const context = newContext(root);
  for (const file of screenFiles(root)) {
    const path = `${root}/${file}`;
    for (const [token, where] of scanFileForegrounds(
      path,
      relative(root, path),
      isColourToken,
      context,
    )) {
      if (!found.has(token)) found.set(token, where);
    }
  }
  return new Map([...found.entries()].sort(([a], [b]) => a.localeCompare(b)));
}
