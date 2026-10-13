/**
 * The studio composer's input height: its bounds per layout, the drag and
 * step math of the resize grip, and the stored preference. Pure so the web
 * and the app size the box alike.
 */

/** Side by side (desktop, landscape tablet) or stacked (phone, upright tablet, the app). */
export type ComposerLayout = "side" | "vertical";

export interface ComposerHeightBounds {
  min: number;
  max: number;
  /** Before the parent has dragged it. */
  initial: number;
}

/** One line of the input (14.5px text at leading-normal, plus its bottom padding). */
export const COMPOSER_ONE_LINE = 28;

/**
 * How far the input may grow back on a phone's plan surface, once there is
 * text to read. Well under the resizable height, which the canvas and the plan
 * need more than the input does.
 */
export const COMPOSER_SURFACE_MAX = 96;

export const COMPOSER_HEIGHT_BOUNDS: Record<ComposerLayout, ComposerHeightBounds> = {
  side: { min: 60, max: 520, initial: 150 },
  // A phone shares the screen with the keyboard: half the side height (about
  // three lines) leaves the thread room, at least two lines, at most ten.
  vertical: { min: 50, max: 240, initial: 75 },
};

/** One arrow key (web) or screen-reader adjust (app) on the grip. */
export const COMPOSER_HEIGHT_STEP = 24;

/** Preference keys; side keeps the original key so desktop sizes survive. */
export const COMPOSER_HEIGHT_KEYS: Record<ComposerLayout, string> = {
  side: "dodi-studio-input-height",
  vertical: "dodi-studio-input-height-vertical",
};

export function clampComposerHeight(height: number, layout: ComposerLayout): number {
  const { min, max } = COMPOSER_HEIGHT_BOUNDS[layout];
  return Math.min(max, Math.max(min, Math.round(height)));
}

/** The stored height, or the layout's initial one when unset or out of bounds. */
export function readComposerHeight(stored: string | null, layout: ComposerLayout): number {
  const { min, max, initial } = COMPOSER_HEIGHT_BOUNDS[layout];
  const height = parseInt(stored ?? "", 10);
  return height >= min && height <= max ? height : initial;
}

/** The height while dragging the grip on the card's top edge: up (negative `deltaY`) grows it. */
export function dragComposerHeight(startHeight: number, deltaY: number, layout: ComposerLayout): number {
  return clampComposerHeight(startHeight - deltaY, layout);
}

/** One step taller or shorter (arrow keys, screen-reader adjust). */
export function stepComposerHeight(height: number, direction: "grow" | "shrink", layout: ComposerLayout): number {
  const delta = direction === "grow" ? COMPOSER_HEIGHT_STEP : -COMPOSER_HEIGHT_STEP;
  return clampComposerHeight(height + delta, layout);
}

export interface ComposerInputHeightInput {
  /** The parent's chosen height. */
  height: number;
  /** A phone's plan surface (sketch, plan) covers the thread. */
  isSurfaceOpen: boolean;
  hasText: boolean;
}

/**
 * The input's rendered height. An open plan surface drops it to one line so
 * the canvas gets the screen, and grows it back a little once there is text.
 */
export function composerInputHeight({ height, isSurfaceOpen, hasText }: ComposerInputHeightInput): number {
  if (!isSurfaceOpen) return height;
  return hasText ? Math.min(height, COMPOSER_SURFACE_MAX) : COMPOSER_ONE_LINE;
}
