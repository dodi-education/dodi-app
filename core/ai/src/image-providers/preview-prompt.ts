/**
 * Builds the prompt that turns the game agent's scene description into the
 * game's square list-preview image (the "icon" shown in game lists). The hard
 * rules (square icon composition, no text, house style, match-the-game look)
 * live here — the agent only supplies the scene. Pure and dependency-free so it
 * can be unit-tested and shared. Mirrors background-prompt.ts.
 */

/** Keep the scene a bounded, single-line description for the prompt. */
export function sanitizePreviewScene(scene: string): string {
  return scene.replace(/[\n\r]+/g, " ").trim().slice(0, 400);
}

/** House-style + safety rules shared by every generated game preview. */
const PREVIEW_RULES = [
  "It is a small square GAME ICON: one clear, centered subject with a simple",
  "backdrop, bold shapes, and strong readability at thumbnail size.",
  "Soft, warm, colorful children's-illustration style with gentle gradients and rounded shapes.",
  "No user-interface elements, no buttons, no frames or borders.",
  "Absolutely NO text of any kind — no letters, no numbers, no words, no signs,",
  "no labels, no watermarks anywhere in the image.",
  "Kid-safe and friendly: nothing scary, violent, or unsettling.",
].join(" ");

/** Appended when the game's background image rides along as a style reference. */
const REFERENCE_RULE =
  "An image of the game's background scenery is attached — match its color palette, " +
  "lighting, and illustration style exactly so the icon looks like it belongs to the " +
  "same game, but compose a fresh square icon rather than copying the image.";

/** Build the image-model prompt for a square game-list preview icon. */
export function buildPreviewPrompt(
  scene: string,
  opts?: { hasStyleReference?: boolean },
): string {
  const cleaned =
    sanitizePreviewScene(scene) || "a cheerful, colorful children's learning game";
  return [
    `A square children's game icon illustration of ${cleaned}.`,
    PREVIEW_RULES,
    opts?.hasStyleReference ? REFERENCE_RULE : "",
  ]
    .filter(Boolean)
    .join(" ");
}
