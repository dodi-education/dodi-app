/**
 * Venice ImageProvider (`POST /image/generate`).
 *
 * Called directly with `fetch` from the unlocked browser vault (or with a dodi
 * AI key) so the key never round-trips our server, mirroring the xAI and
 * Gemini image providers. Kid-facing output: `safe_mode` stays on (Venice blurs
 * adult content) and a blurred or policy-flagged result is rejected rather than
 * drawn into a game.
 */

import { VENICE_BASE_URL } from "../venice";
import type {
  GeneratedImage,
  GenerateImageOptions,
  ImageProvider,
} from "./factory";

/** Aspect ratios Venice's Grok Imagine models accept (from the /models constraints). */
const GROK_IMAGINE_ASPECT_RATIOS = ["1:1", "16:9", "9:16", "3:4", "3:2", "2:3"];

/**
 * Per-model aspect-ratio support. Models listed with `null` take explicit
 * width/height instead (no `aspectRatios` constraint on Venice); unknown models
 * get the common set.
 */
const MODEL_ASPECT_RATIOS: Record<string, string[] | null> = {
  "grok-imagine-image": GROK_IMAGINE_ASPECT_RATIOS,
  "grok-imagine-image-2-0": GROK_IMAGINE_ASPECT_RATIOS,
  "z-image-turbo": null,
};
const DEFAULT_ASPECT_RATIOS = ["1:1", "3:2", "16:9", "9:16", "2:3", "3:4", "4:5"];

/** Long edge for width/height models; Venice caps each side at 1280. */
const DIMENSION_LONG_EDGE = 1024;
const DIMENSION_DIVISOR = 8;

function parseRatio(ratio: string | undefined): number | null {
  if (!ratio) return null;
  const [w, h] = ratio.split(":").map(Number);
  return w && h ? w / h : null;
}

/** Nearest supported aspect ratio by numeric ratio (the drawing stage asks for 4:5). */
export function nearestVeniceAspectRatio(ratio: string | undefined, supported: string[]): string {
  const target = parseRatio(ratio);
  if (target === null) return supported[0];
  let best = supported[0];
  let bestDelta = Infinity;
  for (const cand of supported) {
    const delta = Math.abs((parseRatio(cand) ?? 1) - target);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = cand;
    }
  }
  return best;
}

/** Width/height for models without aspect-ratio support, long edge 1024, multiples of 8. */
export function veniceDimensions(ratio: string | undefined): { width: number; height: number } {
  const target = parseRatio(ratio) ?? 1;
  const snap = (n: number) => Math.max(DIMENSION_DIVISOR, Math.round(n / DIMENSION_DIVISOR) * DIMENSION_DIVISOR);
  return target >= 1
    ? { width: DIMENSION_LONG_EDGE, height: snap(DIMENSION_LONG_EDGE / target) }
    : { width: snap(DIMENSION_LONG_EDGE * target), height: DIMENSION_LONG_EDGE };
}

interface VeniceImageResponse {
  images?: string[];
}

export class VeniceImageProvider implements ImageProvider {
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
    const supported =
      this.model in MODEL_ASPECT_RATIOS ? MODEL_ASPECT_RATIOS[this.model] : DEFAULT_ASPECT_RATIOS;
    const shape = supported
      ? { aspect_ratio: nearestVeniceAspectRatio(options?.aspectRatio, supported), resolution: "1K" }
      : veniceDimensions(options?.aspectRatio);

    const res = await fetch(`${VENICE_BASE_URL}/image/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        prompt,
        ...shape,
        format: "png",
        safe_mode: true,
        hide_watermark: true,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `Venice image generation failed (${res.status})${detail ? `: ${detail}` : ""}`,
      );
    }
    if (
      res.headers.get("x-venice-is-content-violation") === "true" ||
      res.headers.get("x-venice-is-blurred") === "true"
    ) {
      throw new Error("Venice flagged the generated image as unsuitable");
    }

    const body = (await res.json()) as VeniceImageResponse;
    const b64 = body.images?.[0];
    if (!b64) {
      throw new Error("Venice returned no image data");
    }
    return { dataUrl: `data:${imageMimeType(b64)};base64,${b64}` };
  }
}

/**
 * Sniff the MIME type from the base64 payload's magic bytes. `format` is only
 * a request: the grok-imagine models answer JPEG regardless (verified live
 * 2026-10-06), and a mislabeled data URL breaks consumers that trust the type.
 */
export function imageMimeType(b64: string): string {
  if (b64.startsWith("iVBORw0KGgo")) return "image/png";
  if (b64.startsWith("/9j/")) return "image/jpeg";
  if (b64.startsWith("UklGR")) return "image/webp";
  return "image/png";
}
