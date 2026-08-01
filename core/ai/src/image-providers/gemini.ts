/**
 * Gemini ImageProvider (Nano Banana family: gemini-3.1-flash-image /
 * gemini-3-pro-image).
 *
 * Calls the Gemini `generateContent` REST endpoint directly with `fetch` — the
 * same transport the Live client already uses — so it runs entirely in the
 * unlocked browser vault context and never round-trips the key through a server.
 */

import { parseImageDataUrl } from "../data-url";
import type {
  GeneratedImage,
  GenerateImageOptions,
  ImageProvider,
} from "./factory";

const GEMINI_REST_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiInlineData {
  mimeType?: string;
  data?: string;
}

interface GeminiPart {
  text?: string;
  inlineData?: GeminiInlineData;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
  }>;
}

export class GeminiImageProvider implements ImageProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generateImage(
    prompt: string,
    options?: GenerateImageOptions,
  ): Promise<GeneratedImage> {
    const url = `${GEMINI_REST_BASE}/${encodeURIComponent(
      this.model,
    )}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const generationConfig: Record<string, unknown> = {
      responseModalities: ["IMAGE"],
    };
    if (options?.aspectRatio) {
      // Nano Banana honors aspect ratio via imageConfig, so the sheet matches
      // the game canvas instead of being letterboxed.
      generationConfig.imageConfig = { aspectRatio: options.aspectRatio };
    }

    // Style references ride along as inline image parts before the prompt
    // (Nano Banana treats leading images as the visual context to match).
    // Unparseable data URLs are skipped rather than failing the generation.
    const referenceParts: GeminiPart[] = (options?.referenceImages ?? [])
      .map(parseImageDataUrl)
      .filter((parsed): parsed is NonNullable<typeof parsed> => parsed !== null)
      .map((parsed) => ({
        inlineData: { mimeType: parsed.mediaType, data: parsed.base64 },
      }));

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [...referenceParts, { text: prompt }] }],
        generationConfig,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `Gemini image generation failed (${res.status})${detail ? `: ${detail}` : ""}`,
      );
    }

    const body = (await res.json()) as GeminiResponse;
    const parts = body.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find(
      (part) => part.inlineData?.data && part.inlineData.data.length > 0,
    );

    if (!imagePart?.inlineData?.data) {
      throw new Error("Gemini returned no image data");
    }

    const mimeType = imagePart.inlineData.mimeType ?? "image/png";
    return { dataUrl: `data:${mimeType};base64,${imagePart.inlineData.data}` };
  }
}
