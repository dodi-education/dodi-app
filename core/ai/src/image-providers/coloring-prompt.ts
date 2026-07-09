/**
 * Builds the strict prompts that force an image model to produce a flat,
 * child-friendly **coloring sheet** — never a photorealistic or shaded image.
 * Two styles are supported (see {@link DrawingStyle}): a plain 2D picture of the
 * subject (Drawing game) and a symmetrical mandala (Mandala game). Pure and
 * dependency-free (type-only import) so it can be unit-tested and shared.
 */

import type { DrawingStyle } from "@dodi/types/games";

/** Keep the subject a short, safe noun phrase for the prompt. */
export function sanitizeDrawingSubject(subject: string): string {
  return subject.replace(/[\n\r]+/g, " ").trim().slice(0, 80);
}

/** Shared constraints that keep every result a clean, colorable line drawing. */
const COLORING_SHEET_RULES = [
  "Bold, clean black outlines on a pure white background,",
  "with large, simple, clearly enclosed regions that are easy for a young child to color in.",
  "Absolutely NO shading, NO grayscale fills, NO color, NO photorealism, NO 3D rendering,",
  "and NO text — just clean black outlines on white, like a printable coloring page.",
].join(" ");

/**
 * A plain, kid-friendly 2D line drawing of the subject — a normal picture, NOT
 * a mandala. Used by the Drawing game.
 */
export function buildPictureSheetPrompt(subject: string): string {
  const cleaned = sanitizeDrawingSubject(subject) || "a friendly animal";
  return [
    `A simple 2D black-and-white line-art coloring page of ${cleaned}.`,
    "A cute, friendly, kid-style drawing of the subject itself —",
    "NOT a mandala, NOT symmetrical, NOT a repeating or geometric pattern.",
    COLORING_SHEET_RULES,
    "No busy background scene — just the subject, centered and clear.",
  ].join(" ");
}

/**
 * A symmetrical mandala / zentangle coloring sheet of the subject. Used by the
 * Mandala game.
 */
export function buildMandalaSheetPrompt(subject: string): string {
  const cleaned = sanitizeDrawingSubject(subject) || "a friendly animal";
  return [
    `A 2D black-and-white line-art mandala coloring sheet of ${cleaned}.`,
    "Symmetrical mandala / zentangle style,",
    COLORING_SHEET_RULES,
  ].join(" ");
}

/** Pick the prompt builder for a game's configured {@link DrawingStyle}. */
export function buildDrawingPrompt(subject: string, style: DrawingStyle): string {
  return style === "mandala"
    ? buildMandalaSheetPrompt(subject)
    : buildPictureSheetPrompt(subject);
}
