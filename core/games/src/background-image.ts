/**
 * Background-image placeholder contract for AI-generated games.
 *
 * The generation agent never sees image bytes: it references the generated
 * background exactly once via a fixed style block —
 *   <style id="background-image">:root{--background-image:url("{{BACKGROUND_IMAGE}}")}</style>
 * — and uses it as `var(--background-image)`. The client loop swaps the placeholder for
 * the real data URL before persisting (the stored bundle stays self-contained),
 * and swaps it back before feeding existing code to the model on edits, so
 * base64 never enters a model transcript in either direction.
 */

export const BACKGROUND_IMAGE_PLACEHOLDER = "{{BACKGROUND_IMAGE}}";

/** The exact block the agent is instructed to emit (also used in prompts/tests). */
export const BACKGROUND_STYLE_BLOCK = `<style id="background-image">:root{--background-image:url("${BACKGROUND_IMAGE_PLACEHOLDER}")}</style>`;

const BG_STYLE_BLOCK_RE = /(<style\s+id=["']background-image["'][^>]*>)([\s\S]*?)(<\/style>)/i;
const IMAGE_DATA_URL_RE = /data:image\/[a-z+.-]+;base64,[A-Za-z0-9+/=]+/i;

export function hasBackgroundPlaceholder(code: string): boolean {
  return code.includes(BACKGROUND_IMAGE_PLACEHOLDER);
}

export interface ExtractedBackground {
  /** The code with the background data URL replaced by the placeholder. */
  code: string;
  /** The extracted data URL, or null when the code carries none. */
  dataUrl: string | null;
}

/**
 * Reverse swap for edits: pull the inline background data URL out of the
 * background-image style block and put the placeholder back. Codes without the block
 * (or without an inline image in it) pass through unchanged.
 */
export function extractBackgroundImage(code: string): ExtractedBackground {
  const block = code.match(BG_STYLE_BLOCK_RE);
  if (!block || block.index === undefined) return { code, dataUrl: null };
  const dataUrlMatch = block[2].match(IMAGE_DATA_URL_RE);
  if (!dataUrlMatch) return { code, dataUrl: null };
  const dataUrl = dataUrlMatch[0];
  const newBlock =
    block[1] + block[2].replace(dataUrl, BACKGROUND_IMAGE_PLACEHOLDER) + block[3];
  const start = block.index;
  const end = start + block[0].length;
  return { code: code.slice(0, start) + newBlock + code.slice(end), dataUrl };
}

/** Forward swap before persist/render: placeholder → real data URL. */
export function injectBackgroundImage(code: string, dataUrl: string): string {
  // split/join = literal replace-all (no regex/`$` replacement-pattern pitfalls).
  return code.split(BACKGROUND_IMAGE_PLACEHOLDER).join(dataUrl);
}
