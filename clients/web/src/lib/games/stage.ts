/**
 * Browser stage sizing. The canonical dimensions + layout contract are shared in
 * @dodi/games/stage (pure); this module adds the React/CSS sizing helper and
 * re-exports the shared bits so existing `@/lib/games/stage` importers are
 * unaffected.
 */

import type { CSSProperties } from "react";

import { STAGE, STAGE_ASPECT_CSS } from "@dodi/games/stage";

export { STAGE, STAGE_ASPECT_CSS, GAME_CANVAS_TEMPLATE } from "@dodi/games/stage";

/**
 * Inline style that sizes a box to the canonical stage: a fixed 4:5 portrait that
 * is the smaller of the available column width and the width implied by the height
 * budget, so it fits both a wide column and a short viewport without distortion.
 *
 * The width lands in `--stage-w` (not `width`) so consumers apply it via classes
 * and can override it per breakpoint — portrait-mobile stages stretch to the full
 * column width instead (see GameStage).
 *
 * @param reserved Vertical chrome (px) to subtract from the viewport height budget.
 */
export function stageSizeStyle(reserved: number = STAGE.reservedKid): CSSProperties {
  return {
    aspectRatio: STAGE_ASPECT_CSS,
    // Height budget: capped on big screens, floored on tiny ones, minus surrounding chrome.
    ["--stage-h" as string]: `max(${STAGE.minHeight}px, min(${STAGE.maxHeightDesktop}px, calc(100dvh - ${reserved}px)))`,
    // Width derives from that budget so the portrait card never overflows its column or the viewport.
    ["--stage-w" as string]: `min(100%, calc(var(--stage-h) * ${STAGE.aspectW} / ${STAGE.aspectH}))`,
  } as CSSProperties;
}
