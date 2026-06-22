/**
 * Canonical game canvas — the single source of truth for the dimensions
 * AI-generated games are framed in AND the layout contract fed to the generation
 * agents. Pure data + strings (no React), so both the browser stage renderer and
 * the server-side generation agents share exactly these numbers.
 */

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
