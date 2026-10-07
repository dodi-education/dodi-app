import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

import { type Box, boxFromClasses, MIN_TARGET_PT } from "../lib/hit-slop";

/**
 * A source scan for the accessibility rules in clients/mobile/CLAUDE.md, run
 * by `src/accessibility.test.ts`. It type-checks every screen and component
 * with the TypeScript compiler and inspects each control's JSX, so the rules
 * can be precise: attributes are read from the element, classes from literals
 * and from the shared recipes' `as const` types, text from the children.
 */

/** RN's own pressables: they carry no role or label of their own. */
const RAW_PRESSABLES = new Set(["Pressable", "TouchableOpacity", "TouchableHighlight", "TouchableWithoutFeedback"]);

/**
 * The kit's buttons set `accessibilityRole` and the 44pt hit area themselves
 * (lib/control-targets.ts, checked separately); their call sites still owe a
 * label when nothing in them is text.
 */
const KIT_BUTTONS = new Set(["Button", "KidButton"]);

/** Fields and toggles: their visible label sits outside them, so they name themselves. */
const FIELDS = new Set(["TextInput", "Input", "PasswordInput", "Switch"]);

/** Non-control elements that may still take a press (`<Text onPress>`): they owe a role. */
const PRESSABLE_VIEWS = new Set(["Text", "KidText", "View", "Image", "Animated.View"]);

/** Images: content (named and focusable) or decoration (hidden), never left to chance. */
const IMAGES = new Set(["Image", "Animated.Image", "ExpoImage"]);

/** Elements whose content is read out as text. */
const TEXT_TAG = /(^|\.)(Text|KidText|Label|TabsLabel|Badge|RowTitle|RowMeta)$/;

/** Elements laid out from their classes and children alone (a size estimate can see inside them). */
const LAYOUT_TAGS = new Set(["View", "Animated.View", "Pressable", "Image", "Animated.Image"]);

export interface ControlFinding {
  /** `path:line` relative to src. */
  at: string;
  tag: string;
  rule: "role" | "label" | "target" | "field" | "image";
  detail: string;
}

export function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "test-support" ? [] : sourceFiles(path);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
  });
}

type JsxTag = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

function tagName(node: JsxTag): string {
  return node.tagName.getText();
}

function attributes(node: JsxTag): { named: Map<string, ts.JsxAttribute>; hasSpread: boolean } {
  const named = new Map<string, ts.JsxAttribute>();
  let hasSpread = false;
  for (const prop of node.attributes.properties) {
    if (ts.isJsxSpreadAttribute(prop)) hasSpread = true;
    else named.set(prop.name.getText(), prop);
  }
  return { named, hasSpread };
}

/** The attribute's expression (`{…}`), its string literal, or `true` for a bare attribute. */
function attrValue(attr: ts.JsxAttribute | undefined): ts.Expression | true | undefined {
  if (!attr) return undefined;
  const init = attr.initializer;
  if (!init) return true;
  if (ts.isStringLiteral(init)) return init;
  if (ts.isJsxExpression(init)) return init.expression;
  return undefined;
}

function literalText(value: ts.Expression | true | undefined): string | boolean | undefined {
  if (value === true) return true;
  if (!value) return undefined;
  if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) return value.text;
  if (value.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (value.kind === ts.SyntaxKind.FalseKeyword) return false;
  return undefined;
}

/** Hidden from assistive tech on purpose (a decorative backdrop, a mirrored duplicate). */
function isHiddenFromA11y(named: Map<string, ts.JsxAttribute>): boolean {
  const important = literalText(attrValue(named.get("importantForAccessibility")));
  return (
    literalText(attrValue(named.get("accessible"))) === false ||
    important === "no" ||
    important === "no-hide-descendants" ||
    literalText(attrValue(named.get("accessibilityElementsHidden"))) === true ||
    literalText(attrValue(named.get("aria-hidden"))) === true
  );
}

function isLabelled(named: Map<string, ts.JsxAttribute>): boolean {
  return named.has("accessibilityLabel") || named.has("aria-label") || named.has("accessibilityLabelledBy");
}

/** The element's children (an opening element's parent holds them). */
function childrenOf(node: JsxTag): readonly ts.JsxChild[] {
  return ts.isJsxOpeningElement(node) ? node.parent.children : [];
}

function openingOf(node: ts.Node): JsxTag | undefined {
  if (ts.isJsxElement(node)) return node.openingElement;
  if (ts.isJsxSelfClosingElement(node)) return node;
  return undefined;
}

/**
 * Whether anything inside reads as text: a text element, literal text, or an
 * expression that renders no JSX of its own (`{label}`, `{children}`, a
 * translated string). Expressions that do build JSX are searched instead.
 */
function hasTextContent(nodes: readonly ts.Node[]): boolean {
  return nodes.some((node) => {
    if (ts.isJsxText(node)) return node.text.trim().length > 0;
    if (ts.isJsxExpression(node)) {
      if (!node.expression) return false;
      const jsx = jsxWithin(node.expression);
      return jsx.length === 0 ? !isNullish(node.expression) : hasTextContent(jsx);
    }
    if (ts.isJsxFragment(node)) return hasTextContent(node.children);
    const opening = openingOf(node);
    if (!opening) return false;
    if (TEXT_TAG.test(tagName(opening))) return true;
    const { named } = attributes(opening);
    if (isHiddenFromA11y(named)) return false;
    // A nested element that names itself (a labelled avatar or image).
    return isLabelled(named) || (ts.isJsxElement(node) && hasTextContent(node.children));
  });
}

function isNullish(expr: ts.Expression): boolean {
  return expr.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(expr) && expr.text === "undefined");
}

/** The outermost JSX nodes inside an expression (branches of `?:`, `&&`, `.map`). */
function jsxWithin(expr: ts.Node): ts.Node[] {
  if (ts.isJsxElement(expr) || ts.isJsxSelfClosingElement(expr) || ts.isJsxFragment(expr)) return [expr];
  const found: ts.Node[] = [];
  expr.forEachChild((child) => {
    found.push(...jsxWithin(child));
  });
  return found;
}

// ----- Classes and sizes ------------------------------------------------------

/** The class-merging helpers whose arguments are all classes. */
const CLASS_MERGERS = new Set(["cn", "clsx", "twMerge"]);

/**
 * Every class string a `className` expression can produce: literals, recipe
 * values (`kidCard.iconButton`, read from their `as const` literal types) and
 * every branch of `cn(a, cond && "b", x ? "c" : "d")`. Calls other than `cn`
 * (cva recipes like `button.box(p)`) are opaque; the kit owns those targets.
 */
function classStrings(expr: ts.Expression | true | undefined, checker: ts.TypeChecker): string[] {
  if (!expr || expr === true) return [];
  const out: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) out.push(node.text);
    else if (ts.isTemplateExpression(node)) {
      out.push(node.head.text, ...node.templateSpans.map((s) => s.literal.text));
      node.templateSpans.forEach((s) => visit(s.expression));
    } else if (ts.isCallExpression(node)) {
      if (CLASS_MERGERS.has(node.expression.getText())) node.arguments.forEach(visit);
    } else if (ts.isConditionalExpression(node)) {
      visit(node.whenTrue);
      visit(node.whenFalse);
    } else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      visit(node.right); // the left side is the condition
    } else if (ts.isParenthesizedExpression(node)) {
      visit(node.expression);
    } else if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      out.push(...literalStrings(checker.getTypeAtLocation(node)));
    } else node.forEachChild(visit);
  };
  visit(expr);
  return out;
}

function literalStrings(type: ts.Type): string[] {
  if (type.isStringLiteral()) return [type.value];
  if (type.isUnion()) return type.types.flatMap(literalStrings);
  return [];
}

/** A number the checker knows exactly (`20`, `a.icon.size` from an `as const` recipe). */
function literalNumber(expr: ts.Expression | true | undefined, checker: ts.TypeChecker): number | undefined {
  if (!expr || expr === true) return undefined;
  const type = checker.getTypeAtLocation(expr);
  if (type.isNumberLiteral()) return type.value;
  if (type.isUnion() && type.types.every((t) => t.isNumberLiteral())) {
    return Math.min(...type.types.map((t) => (t as ts.NumberLiteralType).value));
  }
  return undefined;
}

const tokensOf = (classes: string[]): string[] => classes.flatMap((c) => c.split(/\s+/)).filter(Boolean);

function spacing(token: string | undefined): number | undefined {
  if (token === undefined) return undefined;
  const arbitrary = token.match(/^\[(\d+(?:\.\d+)?)px\]$/);
  if (arbitrary) return Number(arbitrary[1]);
  return /^\d+(\.\d+)?$/.test(token) ? Number(token) * 4 : undefined;
}

/** The last value of a spacing utility (`py-2` → 8), the one Tailwind's order applies. */
function lastSpacing(tokens: string[], prefix: RegExp): number | undefined {
  const values = tokens.flatMap((t) => {
    const v = spacing(t.match(prefix)?.[1]);
    return v === undefined ? [] : [v];
  });
  return values.at(-1);
}

/** NativeWind's line heights for the named sizes; arbitrary sizes count 1.25× (a lower bound). */
const LINE_HEIGHT: Record<string, number> = { xs: 16, sm: 20, base: 24, lg: 28, xl: 28, "2xl": 32, "3xl": 36 };

function textLineHeight(tokens: string[]): number {
  const leading = tokens.filter((t) => t.startsWith("leading-")).at(-1);
  const size = tokens.filter((t) => /^text-(xs|sm|base|lg|xl|2xl|3xl|\[\d+(\.\d+)?px\])$/.test(t)).at(-1) ?? "text-base";
  const named = size.slice(5);
  const px = LINE_HEIGHT[named] !== undefined ? undefined : Number(named.slice(1, -3));
  const fontSize = px ?? { xs: 12, sm: 14, base: 16, lg: 18, xl: 20, "2xl": 24, "3xl": 30 }[named] ?? 16;
  if (leading === "leading-none") return fontSize;
  const arbitrary = leading?.match(/^leading-\[(\d+(?:\.\d+)?)px\]$/);
  if (arbitrary) return Number(arbitrary[1]);
  return px === undefined ? LINE_HEIGHT[named] : px * 1.25;
}

/** `style={{ width: 30, height: c.head }}`: sizes the checker can read. */
function styleBox(expr: ts.Expression | true | undefined, checker: ts.TypeChecker): Box {
  if (!expr || expr === true || !ts.isObjectLiteralExpression(expr)) return {};
  const read = (name: string): number | undefined => {
    const prop = expr.properties.find((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && p.name.getText() === name);
    return prop ? literalNumber(prop.initializer, checker) : undefined;
  };
  return { height: read("height"), width: read("width") };
}

/**
 * A lower bound of the box an element renders, per axis (undefined: it can't
 * be told from the source, e.g. a custom component or text of unknown width).
 * Fixed classes win; otherwise padding + the children, stacked as a column
 * (React Native's default) or laid out in a row (`flex-row`), with their gaps.
 * One line per text: a label that wraps is only taller.
 */
function estimateBox(node: JsxTag, checker: ts.TypeChecker, isChild = false): Box {
  const tag = tagName(node);
  const { named } = attributes(node);
  const tokens = tokensOf(classStrings(attrValue(named.get("className")), checker));
  if (isChild && tokens.includes("absolute")) return { height: 0, width: 0 }; // out of the flow
  // Stretched by its insets (`absolute inset-y-0`), its parent (`h-full`) or
  // the flex line (`flex-1`, either axis): sized by its surroundings.
  const isFlexed = tokens.some((t) => /^(flex-1|grow|flex-grow|self-stretch)$/.test(t));
  const isTallFromParent = isFlexed || tokens.some((t) => /^(inset-0|inset-y-0|h-full|min-h-full)$/.test(t));
  const isWideFromParent = isFlexed || tokens.some((t) => /^(inset-0|inset-x-0|w-full|min-w-full)$/.test(t));
  if (tag === "Icon") {
    const size = literalNumber(attrValue(named.get("size")), checker) ?? 20;
    return { height: size, width: size };
  }
  if (tag === "ActivityIndicator") return { height: 20, width: 20 };
  if (TEXT_TAG.test(tag)) return { height: textLineHeight(tokens), width: undefined };

  const fixed = boxFromClasses(tokens);
  const styled = styleBox(attrValue(named.get("style")), checker);
  const known: Box = { height: fixed.height ?? styled.height, width: fixed.width ?? styled.width };
  if (isTallFromParent && known.height === undefined) known.height = Number.NaN;
  if (isWideFromParent && known.width === undefined) known.width = Number.NaN;
  if (known.height !== undefined && known.width !== undefined) return known;
  if (!LAYOUT_TAGS.has(tag) || tag.endsWith("Image")) return known;

  const isRow = tokens.includes("flex-row");
  const children = flowChildren(childrenOf(node), checker);
  const gapX = lastSpacing(tokens, /^gap-x-(.+)$/) ?? lastSpacing(tokens, /^gap-(.+)$/) ?? 0;
  const gapY = lastSpacing(tokens, /^gap-y-(.+)$/) ?? lastSpacing(tokens, /^gap-(.+)$/) ?? 0;
  const along = (sizes: (number | undefined)[], gap: number): number | undefined =>
    sizes.some((s) => s === undefined) ? undefined : sizes.reduce<number>((a, s) => a + (s ?? 0), 0) + gap * Math.max(0, sizes.length - 1);
  const across = (sizes: (number | undefined)[]): number | undefined =>
    sizes.some((s) => s === undefined) ? undefined : Math.max(0, ...(sizes as number[]));
  const heights = children.map((c) => c.height);
  const widths = children.map((c) => c.width);
  const contentH = isRow ? across(heights) : along(heights, gapY);
  const contentW = isRow ? along(widths, gapX) : across(widths);

  const all = lastSpacing(tokens, /^p-(.+)$/);
  const y = lastSpacing(tokens, /^py-(.+)$/) ?? all ?? 0;
  const x = lastSpacing(tokens, /^px-(.+)$/) ?? all ?? 0;
  const padH = (lastSpacing(tokens, /^pt-(.+)$/) ?? y) + (lastSpacing(tokens, /^pb-(.+)$/) ?? y);
  const padW = (lastSpacing(tokens, /^pl-(.+)$/) ?? x) + (lastSpacing(tokens, /^pr-(.+)$/) ?? x);
  const minH = lastSpacing(tokens, /^min-h-(.+)$/) ?? 0;
  const minW = lastSpacing(tokens, /^min-w-(.+)$/) ?? 0;
  const border = borderWidth(tokens);
  const height = known.height ?? (contentH === undefined ? undefined : Math.max(minH, padH + contentH + 2 * border));
  const width = known.width ?? (contentW === undefined ? undefined : Math.max(minW, padW + contentW + 2 * border));
  // NaN marks "sized by the parent": unknown to the estimate.
  return { height: Number.isNaN(height) ? undefined : height, width: Number.isNaN(width) ? undefined : width };
}

/** `border` → 1, `border-2` → 2, `border-[1.5px]` → 1.5 (per side). */
function borderWidth(tokens: string[]): number {
  const widths = tokens.flatMap((t) => {
    if (t === "border") return [1];
    const m = t.match(/^border-(\d+|\[(\d+(?:\.\d+)?)px\])$/);
    if (!m) return [];
    return [m[2] !== undefined ? Number(m[2]) : Number(m[1])];
  });
  return widths.at(-1) ?? 0;
}

/**
 * The boxes of the children in the layout flow. A conditional child counts
 * at its smallest branch (none, for `cond && …`); a mapped list as nothing; an
 * opaque `{children}` makes the size unknown.
 */
function flowChildren(nodes: readonly ts.Node[], checker: ts.TypeChecker): Box[] {
  const boxOf = (node: ts.Node): Box | null => {
    const opening = openingOf(node);
    if (opening) return estimateBox(opening, checker, true);
    if (ts.isJsxFragment(node)) {
      return { height: undefined, width: undefined };
    }
    return null;
  };
  return nodes.flatMap((node): Box[] => {
    if (ts.isJsxText(node)) return node.text.trim() ? [{}] : [];
    if (!ts.isJsxExpression(node) || !node.expression) {
      const box = boxOf(node);
      return box ? [box] : [];
    }
    const expr = skipParens(node.expression);
    if (ts.isConditionalExpression(expr)) {
      const branches = [expr.whenTrue, expr.whenFalse].map((b) => smallest(skipParens(b), checker));
      return [minBox(branches)];
    }
    if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return [];
    if (isNullish(expr)) return [];
    const box = boxOf(expr);
    if (box) return [box];
    return [{}]; // `.map(...)`, `{children}`: unknown
  });
}

function skipParens(expr: ts.Expression): ts.Expression {
  return ts.isParenthesizedExpression(expr) ? skipParens(expr.expression) : expr;
}

function smallest(expr: ts.Expression, checker: ts.TypeChecker): Box {
  if (isNullish(expr)) return { height: 0, width: 0 };
  const opening = openingOf(expr);
  return opening ? estimateBox(opening, checker, true) : {};
}

function minBox(boxes: Box[]): Box {
  const min = (values: (number | undefined)[]): number | undefined =>
    values.some((v) => v === undefined) ? undefined : Math.min(...(values as number[]));
  return { height: min(boxes.map((b) => b.height)), width: min(boxes.map((b) => b.width)) };
}

// ----- hitSlop ------------------------------------------------------------------

interface Slop {
  vertical: number;
  horizontal: number;
}

/** A literal `hitSlop` (a number, an inset object or a same-file const); undefined if computed. */
function readHitSlop(expr: ts.Expression | true | undefined, file: ts.SourceFile): Slop | null | undefined {
  if (!expr || expr === true) return null;
  const resolved = ts.isIdentifier(expr) ? constInitializer(expr.text, file) : expr;
  if (!resolved) return undefined;
  if (ts.isNumericLiteral(resolved)) {
    const n = Number(resolved.text);
    return { vertical: 2 * n, horizontal: 2 * n };
  }
  if (ts.isObjectLiteralExpression(resolved)) {
    const side = (name: string): number => {
      const prop = resolved.properties.find(
        (p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && p.name.getText() === name,
      );
      return prop && ts.isNumericLiteral(prop.initializer) ? Number(prop.initializer.text) : 0;
    };
    return { vertical: side("top") + side("bottom"), horizontal: side("left") + side("right") };
  }
  return undefined;
}

function constInitializer(name: string, file: ts.SourceFile): ts.Expression | undefined {
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const decl of statement.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.name.text === name) return decl.initializer;
    }
  }
  return undefined;
}

// ----- The scan -----------------------------------------------------------------

/**
 * A type-checked view of the sources (recipe class values come from their
 * types), with the app's tsconfig when `appDir` has one.
 */
function loadProgram(appDir: string, files: string[]): ts.Program {
  const configPath = join(appDir, "tsconfig.json");
  const options: ts.CompilerOptions = existsSync(configPath)
    ? ts.parseJsonConfigFileContent(ts.readConfigFile(configPath, (p) => ts.sys.readFile(p)).config, ts.sys, appDir).options
    : { jsx: ts.JsxEmit.Preserve, strict: true };
  return ts.createProgram({ rootNames: files, options: { ...options, noEmit: true, skipLibCheck: true } });
}

interface ScanContext {
  file: ts.SourceFile;
  srcDir: string;
  checker: ts.TypeChecker;
  out: ControlFinding[];
}

/** Every finding in the `.tsx` files under `srcDir` (the app: `src`, its tsconfig one level up). */
export function scanControls(srcDir: string, appDir = join(srcDir, "..")): ControlFinding[] {
  const files = sourceFiles(srcDir);
  const program = loadProgram(appDir, files);
  const checker = program.getTypeChecker();
  const out: ControlFinding[] = [];
  for (const path of files) {
    const file = program.getSourceFile(path);
    if (!file) throw new Error(`not in the program: ${path}`);
    const visit = (node: ts.Node): void => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) check(node, { file, srcDir, checker, out });
      node.forEachChild(visit);
    };
    visit(file);
  }
  return out;
}

function check(node: JsxTag, ctx: ScanContext): void {
  const tag = tagName(node);
  const { named, hasSpread } = attributes(node);
  if (isHiddenFromA11y(named)) return;
  const { file, srcDir, checker, out } = ctx;
  const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
  const report = (rule: ControlFinding["rule"], detail: string): void => {
    out.push({ at: `${relative(srcDir, file.fileName)}:${line}`, tag, rule, detail });
  };
  const hasRole = named.has("accessibilityRole") || named.has("role");

  if (FIELDS.has(tag)) {
    if (!hasSpread && !isLabelled(named)) {
      report("field", "no accessibilityLabel (a placeholder or a Label beside it is not its name)");
    }
    return;
  }
  if (IMAGES.has(tag)) {
    checkImage(node, named, report);
    return;
  }
  if (PRESSABLE_VIEWS.has(tag)) {
    if ((named.has("onPress") || named.has("onLongPress")) && !hasRole) report("role", "takes a press but has no accessibilityRole");
    return;
  }
  const isRaw = RAW_PRESSABLES.has(tag);
  if (!isRaw && !KIT_BUTTONS.has(tag)) return;

  // A wrapper forwarding `{...props}` gets its role and label from its caller.
  if (isRaw && !hasSpread && !hasRole) report("role", "no accessibilityRole");
  if (!hasSpread && !isLabelled(named) && !hasTextContent(childrenOf(node))) {
    report("label", "nothing in it reads as text and it has no accessibilityLabel");
  }
  // The kit sizes its own targets (lib/control-targets); a wrapper's caller passes them.
  if (!isRaw || hasSpread) return;

  const slop = readHitSlop(attrValue(named.get("hitSlop")), file);
  if (slop === undefined) return; // a computed hitSlop: the component owns its math (and its test)
  const given = slop ?? { vertical: 0, horizontal: 0 };
  const box = estimateBox(node, checker);
  const short: string[] = [];
  if (box.height !== undefined && box.height + given.vertical < MIN_TARGET_PT) {
    short.push(`height ${round(box.height)}+${given.vertical}`);
  }
  if (box.width !== undefined && box.width + given.horizontal < MIN_TARGET_PT) {
    short.push(`width ${round(box.width)}+${given.horizontal}`);
  }
  if (short.length > 0) report("target", `${short.join(", ")} < ${MIN_TARGET_PT}pt: add a hitSlop`);
}

const round = (n: number): number => Math.round(n * 10) / 10;

/**
 * An image either conveys something (`accessible` + `accessibilityLabel`: iOS
 * skips an image that isn't `accessible`), is decoration (hidden), or sits in
 * a control or grouped view that speaks for it.
 */
function checkImage(
  node: JsxTag,
  named: Map<string, ts.JsxAttribute>,
  report: (rule: ControlFinding["rule"], detail: string) => void,
): void {
  if (isLabelled(named)) {
    const isFocusable = literalText(attrValue(named.get("accessible"))) === true;
    if (!isFocusable) report("image", "has a label but is not `accessible` (VoiceOver skips it)");
    return;
  }
  if (isInsideNamedGroup(node)) return;
  report("image", "neither labelled (content) nor hidden (decoration), and no control around it speaks for it");
}

/** Whether a JSX ancestor (in the same expression) is a control, a grouped view or hidden. */
function isInsideNamedGroup(node: JsxTag): boolean {
  let current: ts.Node = ts.isJsxOpeningElement(node) ? node.parent : node;
  for (let parent = current.parent; parent; current = parent, parent = parent.parent) {
    if (ts.isJsxExpression(parent) || ts.isConditionalExpression(parent) || ts.isParenthesizedExpression(parent)) continue;
    if (ts.isBinaryExpression(parent) || ts.isJsxFragment(parent)) continue;
    if (!ts.isJsxElement(parent)) return false;
    const opening = parent.openingElement;
    const tag = tagName(opening);
    const { named } = attributes(opening);
    if (RAW_PRESSABLES.has(tag) || KIT_BUTTONS.has(tag) || isHiddenFromA11y(named)) return true;
    if (literalText(attrValue(named.get("accessible"))) === true) return true;
  }
  return false;
}
