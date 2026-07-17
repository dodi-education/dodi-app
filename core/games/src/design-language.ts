/**
 * Visual design language — the quality floor injected into every game-generation
 * prompt. Theme and palette stay the model's per-game creative choice; the rules
 * and recipes here are the non-negotiable minimum that keeps generated games from
 * looking like unstyled webpages. Pure strings (no React), shared by browser and
 * node generation paths like the other prompt templates in this package.
 */

import type { GamePerspective } from "@dodi/types/games";

/** Parent-facing labels, reused by prompt text so wording stays consistent. */
export const PERSPECTIVE_LABELS: Record<GamePerspective, string> = {
  bird: "Bird's eye (top-down)",
  side: "Side-on",
  isometric: "Isometric 2.5D",
};

const PERSPECTIVE_GUIDANCE: Record<GamePerspective, string> = {
  bird: `### Perspective: Bird's eye (top-down) — REQUIRED
Stage the whole game as seen from above:
- The playfield is a textured ground plane (grass, water, tiles, table…), never a flat color.
- Objects are drawn in top view and cast a small soft shadow DIRECTLY BENEATH them
  (e.g. box-shadow: 0 0 12px rgba(0,0,0,.25) or an ellipse under the sprite).
- Convey height by scale + shadow distance (higher = bigger offset, softer shadow).
- Movement happens in x/y across the plane; nothing sits "on the horizon".`,
  side: `### Perspective: Side-on — REQUIRED
Stage the whole game as a side view:
- Build the scene from horizontal layers: sky/backdrop, 1-2 parallax mid layers, and a
  clearly visible ground/floor line the action stands on.
- Grounded objects get a contact shadow (small dark ellipse) where they meet the floor.
- Depth = layering: background layers are lighter/blurrier, foreground is saturated and sharp.
- Jumps/falls move along y; travel moves along x (scroll or shift the parallax layers).`,
  isometric: `### Perspective: Isometric 2.5D — REQUIRED
Build the scene from objects DRAWN in 2.5D — do NOT tilt the whole game or playfield with
a CSS transform (that just looks like a rotated flat drawing and makes everything on it
skewed and unreadable):
- Round things seen at an angle (bowls, plates, ponds, wheels) are ELLIPSES: a bright
  top-face ellipse layered over a darker rim/side below it (stacked elements or
  radial-gradients), never a circle rotated in 3D.
- Boxy things get a bright top face and darker side faces of the same hue (consistent
  light from the top-left).
- Depth without transforms: things lower on screen are nearer — place along y, scale
  slightly larger when nearer, and set z-index by y.
- The ONLY legitimate use of a CSS plane tilt
  (transform: perspective(900px) rotateX(55deg) rotateZ(45deg)) is a rectangular TILE
  GRID (a board/world of square tiles). If you tilt a grid, counter-rotate every glyph,
  label, and sprite standing on it so they stay upright and readable, and keep touch
  targets >= 44x44 px measured AFTER the transform.
- NEVER place readable text or tappable elements inside a tilted plane without
  counter-rotating them.`,
};

const PERSPECTIVE_CHOICE = `### Perspective — choose one, then commit
No perspective was configured. Pick the one that best fits the game concept and apply its
staging rules consistently across EVERY screen (never mix perspectives):
- Bird's eye (top-down): mazes, boards, collecting/sorting on a plane. Textured ground
  plane, top-view sprites, soft shadows directly beneath objects.
- Side-on: runners, jumpers, conversations, anything with gravity. Layered parallax
  backdrop, visible floor line, contact shadows under grounded objects.
- Isometric 2.5D: building, tile puzzles, little worlds. Objects DRAWN in 2.5D (bright
  top faces + darker sides, ellipses for round shapes, depth by y-position); a CSS plane
  tilt only for square tile grids, with everything on it counter-rotated.`;

/**
 * Build the design-language prompt section. Pass the game's configured
 * perspective (null/undefined = the agent chooses one from the concept).
 */
export function designLanguageDoc(perspective?: GamePerspective | null): string {
  const perspectiveSection = perspective
    ? PERSPECTIVE_GUIDANCE[perspective]
    : PERSPECTIVE_CHOICE;

  return `
## Visual Design Language (QUALITY FLOOR — REQUIRED)

Theme, color palette, and characters are YOUR creative choice per game — but the rules
below are a hard minimum. A game that looks like a default webpage is a failed game.

BANNED (never ship any of these):
- A flat white or single flat-color page background.
- Unstyled or browser-default-looking <button>, <input>, or list elements.
- Browser-default typography (default font, default sizes).
- Text sitting bare on the background with no container, contrast treatment, or shadow.
- Baking text, letters, or numbers into raster/SVG-as-picture artwork. Every glyph the
  child reads MUST be real DOM/SVG text so it can be translated and stays crisp.
- Hand-drawing letters or numbers as SVG/canvas paths. Glyph shapes come from real fonts
  — invented letterform geometry is ALWAYS wrong, and one "generic" path reused across
  different letters is worse.

REQUIRED DEPTH & MATERIALS — every game uses layered depth. Adapt these recipes (colors
are examples, pick your own palette):

Background (always layered, never flat):
  body { background: linear-gradient(180deg, #cfe8ff 0%, #eaf6d8 100%); }
  /* plus 1-2 large soft decorative shapes: blurred radial-gradient "blobs", hills,
     clouds, bubbles… positioned absolutely behind the play area */

2.5D tile / card (raised toy feel):
  .tile { border-radius: 16px;
    background: linear-gradient(180deg, #ffd66e, #f5a623);
    box-shadow: inset 0 2px 0 rgba(255,255,255,.6), 0 6px 0 #c47d0e, 0 10px 18px rgba(0,0,0,.2); }

Chunky pressable button (extruded edge + press):
  .btn { border-radius: 14px; border: 0; font-weight: 700;
    background: linear-gradient(180deg, #6ecb63, #4caf50);
    box-shadow: 0 5px 0 #35803a, 0 8px 14px rgba(0,0,0,.25); }
  .btn:active { transform: translateY(4px); box-shadow: 0 1px 0 #35803a; }

Extruded display text (titles, scores):
  .display { font-weight: 800; color: #fff;
    text-shadow: 0 2px 0 #d17b16, 0 4px 0 #b06210, 0 6px 10px rgba(0,0,0,.3); }

Standard motion (use sparingly and purposefully):
  @keyframes float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-8px) } }
  @keyframes pop { 0% { transform: scale(.6); opacity: 0 } 70% { transform: scale(1.08) } 100% { transform: scale(1) } }
  @keyframes wiggle { 0%,100% { transform: rotate(0) } 25% { transform: rotate(-4deg) } 75% { transform: rotate(4deg) } }
  - float: idle hero/mascot elements. pop: new/collected items, reward moments.
  - wiggle (or a short shake): wrong answers — playful, never punishing.

TYPOGRAPHY:
- Use a rounded, friendly stack: font-family: ui-rounded, "Comic Sans MS", "Segoe UI", system-ui, sans-serif;
- Clear hierarchy: one big display size (title/score), one medium (labels), one body size.
- Labels and instructions: font-weight 600+, generous letter-spacing for young readers.

LETTERS, NUMBERS & TRACING MECHANICS:
- Every letter/number the child sees is real font-rendered text (see the ban above).
- Games that trace, draw, or animate HOW characters are written: call the
  read_char_paths tool — it returns every character's strokes in correct school order
  and direction. Embed that data in the game and validate the child's strokes against
  it stroke by stroke (start point, corridor around the median, direction, order).
  NEVER invent stroke geometry yourself.
- Only for characters read_char_paths does not cover, fall back to raster-coverage
  validation: draw the glyph as large font text on an offscreen canvas (fillText) and
  check the child's stroke via getImageData coverage.

MOTION & ACCESSIBILITY:
- Every interaction gives visual feedback (hover/press state, transition, or animation).
- Include this block and make the game fully playable with it active:
    @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }

${perspectiveSection}
`.trim();
}
