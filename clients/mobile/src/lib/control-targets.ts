import {
  button,
  type ButtonSize,
  kidButton,
  type KidButtonSize,
  type KidButtonVariant,
} from "@dodi/ui-recipes";

import { boxFromClasses, type HitSlop, hitSlopFor, verticalPaddingFromClasses } from "./hit-slop";

/**
 * The 44pt hit areas of the kit's buttons, from their recipe classes. Pure,
 * so accessibility.test.ts checks every size; a caller's `hitSlop` wins.
 */
export const BUTTON_SIZES = [
  "default",
  "xs",
  "sm",
  "lg",
  "icon",
  "icon-xs",
  "icon-sm",
  "icon-lg",
] as const satisfies readonly ButtonSize[];

/** The web's Button sizes are all under 44pt (h-9, size-8 …): the target grows, the look doesn't. */
export const BUTTON_HIT_SLOP = Object.fromEntries(
  BUTTON_SIZES.map((size) => [size, hitSlopFor(boxFromClasses(button.box({ size })))]),
) as Record<ButtonSize, HitSlop | undefined>;

export const KID_BUTTON_SIZES = ["default", "sm", "lg", "none"] as const satisfies readonly KidButtonSize[];
export const KID_BUTTON_VARIANTS = ["play", "ghost", "icon", "chip", "back"] as const satisfies readonly KidButtonVariant[];

/** The kid label's font size per KidButton size (kidButton.text: text-[14.5px] …). */
const KID_BUTTON_TEXT_PX: Record<KidButtonSize, number> = { default: 14.5, sm: 13.5, lg: 15, none: 0 };
/**
 * A single line is at least 1.25× its font size (Nunito's own line height is
 * ~1.36): the lower bound keeps the estimate on the safe side.
 */
const MIN_LINE_HEIGHT = 1.25;

/**
 * The pills size to their padding and one line of text (no fixed height), the
 * icon variant is a fixed 38pt circle. `none` has neither: its caller sizes it.
 */
export function kidButtonBox(variant: KidButtonVariant, size: KidButtonSize): { height?: number; width?: number } {
  const classes = kidButton.box({ variant, size });
  const fixed = boxFromClasses(classes);
  if (fixed.height !== undefined || size === "none") return fixed;
  return { height: verticalPaddingFromClasses(classes) + KID_BUTTON_TEXT_PX[size] * MIN_LINE_HEIGHT };
}

export function kidButtonHitSlop(variant: KidButtonVariant, size: KidButtonSize): HitSlop | undefined {
  return hitSlopFor(kidButtonBox(variant, size));
}
