/**
 * Canonical game canvas — the single source of truth for how AI-generated games
 * are framed on screen AND what dimensions the generation agents design against.
 *
 * Every game is rendered in ONE fixed portrait stage, scaled uniformly to fit the
 * player's device, so a game looks identical in the parent studio preview and the
 * kid play view across phone / tablet / desktop. The same numbers are fed to the
 * generation agents via {@link GAME_CANVAS_TEMPLATE} so the spec they design to
 * always matches the real render.
 */

import type { CSSProperties } from "react";

export const STAGE = {
  /** Portrait aspect ratio (width : height). */
  aspectW: 4,
  aspectH: 5,
  /** Design-reference canvas the agent treats as its coordinate system (NOT a hard pixel canvas). */
  logicalWidth: 576,
  logicalHeight: 720,
  /** Height cap on roomy (desktop/tablet) screens; width follows the ratio (~720px wide). */
  maxHeightDesktop: 900,
  /** Playable height floor on very short viewports. */
  minHeight: 360,
  /** Vertical chrome to reserve so the stage fits without scrolling, per surface. */
  reservedKid: 200,
  reservedStudio: 120,
} as const;

/** `aspect-ratio` CSS value, e.g. "4 / 5". */
export const STAGE_ASPECT_CSS = `${STAGE.aspectW} / ${STAGE.aspectH}`;

/**
 * Inline style that sizes a box to the canonical stage: a fixed 4:5 portrait that
 * is the smaller of the available column width and the width implied by the height
 * budget, so it fits both a wide column and a short viewport without distortion.
 *
 * @param reserved Vertical chrome (px) to subtract from the viewport height budget.
 */
export function stageSizeStyle(reserved: number = STAGE.reservedKid): CSSProperties {
  return {
    aspectRatio: STAGE_ASPECT_CSS,
    // Height budget: capped on big screens, floored on tiny ones, minus surrounding chrome.
    ["--stage-h" as string]: `max(${STAGE.minHeight}px, min(${STAGE.maxHeightDesktop}px, calc(100dvh - ${reserved}px)))`,
    // Width derives from that budget so the portrait card never overflows its column or the viewport.
    width: `min(100%, calc(var(--stage-h) * ${STAGE.aspectW} / ${STAGE.aspectH}))`,
  } as CSSProperties;
}

/** Layout contract injected into every game-generation prompt (see agent-system-prompt + game-generation). */
export const GAME_CANVAS_TEMPLATE = `
## Game Canvas (REQUIRED LAYOUT CONTRACT)

Design the game for ONE fixed canvas — it is the only layout target.

- Shape: portrait, aspect ratio ${STAGE.aspectW}:${STAGE.aspectH}.
- Design reference size: ${STAGE.logicalWidth} x ${STAGE.logicalHeight} (width x height). Treat this
  as your coordinate system; the canvas is scaled uniformly to fit the player's screen
  (phone, tablet, desktop), so proportions are always preserved.
- The game MUST fill its container exactly and own NO viewport:
    html, body { margin: 0; height: 100%; width: 100%; overflow: hidden; }
    <your game root> { width: 100%; height: 100%; }
  NEVER use 100vh / 100vw / calc(100vh - X). The game fills 100% of a ${STAGE.aspectW}:${STAGE.aspectH} box —
  assuming a taller screen than you are given is exactly what causes controls to be clipped.
- Lay out with %, flex, and grid relative to the root so everything fits the ${STAGE.aspectW}:${STAGE.aspectH}
  box with no scrolling and no clipping at any scale.
- Keep touch targets >= 44x44 px. Avoid fixed pixel heights that assume extra vertical space.
`.trim();
