/**
 * Client-side coloring-sheet generation (E2EE). When a kid asks dodi to draw
 * something in the Drawing game, this resolves the vault-held image provider/key
 * and calls the image model directly from the browser (the server never sees the
 * key). Returns a `data:` URL the sandbox renders as the new canvas base layer.
 */
import { resolveClientImage } from "@/lib/ai/resolve-client-image";
import { createClientImageProvider } from "@dodi/ai/image-providers/factory";
import { buildColoringSheetPrompt } from "@dodi/ai/image-providers/coloring-prompt";
import { STAGE } from "@dodi/games/stage";

export class NoImageModelError extends Error {
  constructor() {
    super("No image model configured");
    this.name = "NoImageModelError";
  }
}

/**
 * Generate a mandala coloring-sheet outline of `subject` and return it as a
 * `data:` URL. Throws {@link NoImageModelError} when no image model is set up.
 */
export async function generateDrawing(subject: string): Promise<string> {
  const image = await resolveClientImage();
  if (!image) throw new NoImageModelError();

  const provider = createClientImageProvider(
    image.provider,
    image.apiKey,
    image.model,
  );
  const { dataUrl } = await provider.generateImage(
    buildColoringSheetPrompt(subject),
    { aspectRatio: `${STAGE.aspectW}:${STAGE.aspectH}` },
  );
  return dataUrl;
}
