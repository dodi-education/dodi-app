/**
 * Builds the prompt that turns the game agent's scene description into a
 * consistent, kid-friendly game **background illustration**. The hard rules
 * (no text, backdrop-only composition, house style) live here — the agent only
 * supplies the scene. Pure and dependency-free (type-only import) so it can be
 * unit-tested and shared.
 */

import type { GamePerspective } from "@dodi/types/games";

/** Keep the scene a bounded, single-line description for the prompt. */
export function sanitizeBackgroundScene(scene: string): string {
  return scene.replace(/[\n\r]+/g, " ").trim().slice(0, 400);
}

const PERSPECTIVE_HINTS: Record<GamePerspective, string> = {
  bird: "Seen directly from above (top-down bird's-eye view), like looking down at a game board or map.",
  side: "Seen side-on with a clear horizon and layered depth, like the backdrop of a side-scrolling game.",
  isometric: "Rendered in an isometric 2.5D view with a consistent viewing angle, like an isometric game world.",
};

/** House-style + safety rules shared by every generated game background. */
const BACKGROUND_RULES = [
  "Soft, warm, colorful children's-illustration style with gentle gradients and rounded shapes.",
  "It is a BACKGROUND: keep the composition calm and uncluttered with soft contrast,",
  "so bright game elements and text layered on top stay clearly readable.",
  "No main characters, no interactive objects, no user-interface elements.",
  "Absolutely NO text of any kind — no letters, no numbers, no words, no signs,",
  "no labels, no watermarks anywhere in the image.",
  "Kid-safe and friendly: nothing scary, violent, or unsettling.",
].join(" ");

/** Build the image-model prompt for a game background. */
export function buildBackgroundPrompt(
  scene: string,
  perspective?: GamePerspective | null,
): string {
  const cleaned = sanitizeBackgroundScene(scene) || "a cheerful sunny meadow with rolling hills";
  return [
    `A children's game background illustration of ${cleaned}.`,
    perspective ? PERSPECTIVE_HINTS[perspective] : "",
    BACKGROUND_RULES,
  ]
    .filter(Boolean)
    .join(" ");
}
