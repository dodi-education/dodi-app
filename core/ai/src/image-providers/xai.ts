/**
 * xAI Grok ImageProvider (Grok Imagine).
 *
 * xAI's image endpoint is OpenAI images-API-compatible. Called directly with
 * `fetch` from the unlocked browser vault so the key never round-trips a server
 * (BYOK provider-blindness), mirroring the Gemini image provider.
 */

import { XAI_BASE_URL } from "../xai";
import type {
  GeneratedImage,
  GenerateImageOptions,
  ImageProvider,
} from "./factory";

// Aspect ratios the Grok Imagine API accepts. The drawing stage asks for 4:5,
// which isn't in the set, so we snap to the nearest by numeric ratio.
const XAI_ASPECT_RATIOS = [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "3:2",
  "2:3",
  "2:1",
  "1:2",
];

function nearestAspectRatio(ratio?: string): string {
  if (!ratio) return "auto";
  const [w, h] = ratio.split(":").map(Number);
  if (!w || !h) return "auto";
  const target = w / h;
  let best = XAI_ASPECT_RATIOS[0];
  let bestDelta = Infinity;
  for (const cand of XAI_ASPECT_RATIOS) {
    const [cw, ch] = cand.split(":").map(Number);
    const delta = Math.abs(cw / ch - target);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = cand;
    }
  }
  return best;
}

interface XaiImageResponse {
  data?: Array<{ b64_json?: string; url?: string }>;
}

export class XaiImageProvider implements ImageProvider {
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
    const res = await fetch(`${XAI_BASE_URL}/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        prompt,
        n: 1,
        response_format: "b64_json",
        aspect_ratio: nearestAspectRatio(options?.aspectRatio),
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `xAI image generation failed (${res.status})${detail ? `: ${detail}` : ""}`,
      );
    }

    const body = (await res.json()) as XaiImageResponse;
    const b64 = body.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error("xAI returned no image data");
    }
    return { dataUrl: `data:image/png;base64,${b64}` };
  }
}
