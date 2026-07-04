/**
 * Builds the strict prompt that forces an image model to produce a flat,
 * child-friendly mandala **coloring sheet** — never a photorealistic or shaded
 * image. Pure and dependency-free so it can be unit-tested and shared.
 */

/** Keep the subject a short, safe noun phrase for the prompt. */
export function sanitizeDrawingSubject(subject: string): string {
  return subject.replace(/[\n\r]+/g, " ").trim().slice(0, 80);
}

export function buildColoringSheetPrompt(subject: string): string {
  const cleaned = sanitizeDrawingSubject(subject) || "a friendly animal";
  return [
    `A 2D black-and-white line-art mandala coloring sheet of ${cleaned}.`,
    "Bold, clean black outlines on a pure white background, symmetrical mandala / zentangle style,",
    "with large, simple, clearly enclosed regions that are easy for a young child to color in.",
    "Absolutely NO shading, NO grayscale fills, NO color, NO photorealism, NO 3D rendering,",
    "NO background scene and NO text — just clean black outlines on white, like a printable coloring page.",
  ].join(" ");
}
