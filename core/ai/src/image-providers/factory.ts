/**
 * ImageProvider factory — creates the right image-generation provider based on
 * config. Mirrors thinking-providers/factory.ts.
 *
 * Image generation runs client-side only (the provider key lives in the browser
 * vault and the server can never decrypt it), so these providers are written to
 * be browser-importable and call the provider REST API directly with `fetch`.
 */

import type { AIProviderId } from "@dodi/types/ai";

import { GeminiImageProvider } from "./gemini";
import { XaiImageProvider } from "./xai";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface GeneratedImage {
  /** A `data:<mime>;base64,<...>` URL ready to draw onto a canvas. */
  dataUrl: string;
}

export interface GenerateImageOptions {
  /** Aspect ratio hint for the model, e.g. "4:5" to match the game canvas. */
  aspectRatio?: string;
}

export interface ImageProvider {
  generateImage(
    prompt: string,
    options?: GenerateImageOptions,
  ): Promise<GeneratedImage>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createClientImageProvider(
  providerId: AIProviderId,
  apiKey: string,
  model: string,
): ImageProvider {
  switch (providerId) {
    case "gemini":
      return new GeminiImageProvider(apiKey, model);
    case "xai":
      return new XaiImageProvider(apiKey, model);
    default:
      throw new Error(
        `Provider "${providerId}" is not supported for image generation`,
      );
  }
}
