/**
 * Touch targets: the web's controls are often smaller than the 44pt minimum
 * (Apple HIG, WCAG 2.5.5, CLAUDE.md: critical for kids on tablets). The app
 * keeps the web's look and widens the target with `hitSlop` instead. These
 * helpers read a control's box from its Tailwind classes (at the app's 16px
 * rem, see rem-parity.test.ts) and give the slop that reaches 44pt.
 *
 * Pure (no react-native import): the kit uses it at runtime and the
 * accessibility scan (accessibility.test.ts) in Node.
 */

export const MIN_TARGET_PT = 44;
/** Tailwind's spacing step at the app's 16px rem. */
const SPACING_STEP_PT = 4;

export interface Box {
  height?: number;
  width?: number;
}

export interface HitSlop {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}

/** `9` → 36, `[38px]` → 38, `2.5` → 10; undefined for anything else (`full`, `auto`). */
function spacingPt(value: string): number | undefined {
  const arbitrary = value.match(/^\[(\d+(?:\.\d+)?)px\]$/);
  if (arbitrary) return Number(arbitrary[1]);
  if (/^\d+(\.\d+)?$/.test(value)) return Number(value) * SPACING_STEP_PT;
  return undefined;
}

function tokensOf(classes: string | readonly string[]): string[] {
  return (typeof classes === "string" ? [classes] : classes).flatMap((c) => c.split(/\s+/)).filter(Boolean);
}

function sizesFor(tokens: string[], prefix: RegExp): number[] {
  return tokens.flatMap((t) => {
    const m = t.match(prefix);
    const size = m ? spacingPt(m[1]) : undefined;
    return size === undefined ? [] : [size];
  });
}

/**
 * The smallest box the classes can give a control, per axis: `h-*`/`w-*`/
 * `size-*`, lifted by `min-h-*`/`min-w-*`. When several branches set a size
 * (`cond ? "h-8" : "h-11"`) the smallest counts: any branch can render.
 * Undefined on an axis no class fixes (it grows with its content).
 */
export function boxFromClasses(classes: string | readonly string[]): Box {
  const tokens = tokensOf(classes);
  const axis = (fixed: RegExp, min: RegExp): number | undefined => {
    const sizes = sizesFor(tokens, fixed);
    if (sizes.length === 0) return undefined;
    return Math.max(Math.min(...sizes), ...sizesFor(tokens, min), 0);
  };
  return {
    height: axis(/^(?:h|size)-(.+)$/, /^min-h-(.+)$/),
    width: axis(/^(?:w|size)-(.+)$/, /^min-w-(.+)$/),
  };
}

/** The vertical padding classes give (`py-2` → 16, `p-1` → 8, `pt-1 pb-2` → 12). */
export function verticalPaddingFromClasses(classes: string | readonly string[]): number {
  const tokens = tokensOf(classes);
  const last = (prefix: RegExp): number | undefined => sizesFor(tokens, prefix).at(-1);
  const all = last(/^p-(.+)$/);
  const y = last(/^py-(.+)$/) ?? all ?? 0;
  return (last(/^pt-(.+)$/) ?? y) + (last(/^pb-(.+)$/) ?? y);
}

/** The slop that grows a box to 44pt on each fixed axis (split evenly); undefined if it already is. */
export function hitSlopFor(box: Box): HitSlop | undefined {
  const grow = (size: number | undefined): number =>
    size === undefined ? 0 : Math.max(0, Math.ceil((MIN_TARGET_PT - size) / 2));
  const vertical = grow(box.height);
  const horizontal = grow(box.width);
  if (vertical === 0 && horizontal === 0) return undefined;
  return {
    ...(vertical > 0 ? { top: vertical, bottom: vertical } : {}),
    ...(horizontal > 0 ? { left: horizontal, right: horizontal } : {}),
  };
}

/** The target a box reaches with a slop (an axis without a fixed size counts as reaching it). */
export function targetWith(box: Box, slop: HitSlop | number | undefined): Box {
  const s = typeof slop === "number" ? { top: slop, bottom: slop, left: slop, right: slop } : (slop ?? {});
  return {
    height: box.height === undefined ? undefined : box.height + (s.top ?? 0) + (s.bottom ?? 0),
    width: box.width === undefined ? undefined : box.width + (s.left ?? 0) + (s.right ?? 0),
  };
}
