/**
 * Shared metrics of the code views: the gutter and the code must share one
 * line height to stay aligned (the web's text-[12.5px] leading-[1.75]).
 */
export const CODE_FONT_SIZE = 12.5;
export const CODE_LINE_HEIGHT = CODE_FONT_SIZE * 1.75;

/** Long bundles render in chunks: one huge Text is slow to lay out on Android. */
export const CODE_CHUNK_LINES = 150;

/** The lines in chunks, each with the (1-based) number of its first line. */
export function chunkLines(lines: string[], size = CODE_CHUNK_LINES): { start: number; lines: string[] }[] {
  const chunks: { start: number; lines: string[] }[] = [];
  for (let i = 0; i < lines.length; i += size) chunks.push({ start: i + 1, lines: lines.slice(i, i + size) });
  return chunks;
}
