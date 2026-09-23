/**
 * Client side of the screenshot service: turn a game bundle into the exact
 * sandbox document the app would load (shim + CSP via buildSandboxSrcDoc),
 * post it to the configured service, and hand real frames back to the agent
 * loop. The two targets are interchangeable: the platform's proxy for the
 * dodi worker (authenticated), or a parent's own service at a custom URL
 * (plain CORS fetch, no credentials). Either way the reply is validated
 * against the contract and every frame is re-encoded through a canvas at the
 * studio's screenshot bound, because a custom service is untrusted.
 *
 * Never throws: null means "no frames", and the loop carries on without a
 * visual check.
 */

import { buildSandboxSrcDoc } from "@/components/games/game-sandbox";
import { dodi } from "@/lib/api";
import { downscaleDataUrl } from "@/lib/games/thumbnail";
import type { RenderGameInput, RenderGameOutput } from "@dodi/ai/game-agent-tools";
import {
  DEFAULT_SCREENSHOT_VIEWPORT,
  SCREENSHOT_CONTRACT_VERSION,
  ScreenshotResponseSchema,
  type ScreenshotRequest,
} from "@dodi/games/screenshot-contract";

export type ScreenshotTarget = { mode: "dodi" } | { mode: "custom"; url: string };

/** Same bound as the edit-time screenshot the model already gets. */
const FRAME_BOUND = { maxWidth: 768, maxHeight: 960, quality: 0.8 } as const;
/** Worker deadline (20 s) plus proxy and transfer headroom. */
const CAPTURE_TIMEOUT_MS = 25_000;

// The platform answered 503: no worker is configured (a self-host without one)
// or dodi's worker is down. Remembered for the session so the studio neither
// keeps asking nor nags about it on every build; a reload tries again.
let dodiServiceUnavailable = false;

export function isDodiScreenshotServiceUnavailable(): boolean {
  return dodiServiceUnavailable;
}

export async function captureGameFrames(
  input: RenderGameInput,
  target: ScreenshotTarget,
): Promise<RenderGameOutput | null> {
  if (target.mode === "dodi" && dodiServiceUnavailable) return null;

  const request: ScreenshotRequest = {
    version: SCREENSHOT_CONTRACT_VERSION,
    document: buildSandboxSrcDoc(input.code),
    viewport: DEFAULT_SCREENSHOT_VIEWPORT,
    steps: input.steps.map((step) => ({ label: step.label, command: step.command })),
  };
  const body = JSON.stringify(request);
  const signal = AbortSignal.timeout(CAPTURE_TIMEOUT_MS);

  try {
    const res =
      target.mode === "dodi"
        ? await dodi.request("/api/games/screenshot", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            signal,
          })
        : await fetch(target.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            mode: "cors",
            credentials: "omit",
            signal,
          });
    if (target.mode === "dodi" && res.status === 503) {
      dodiServiceUnavailable = true;
      return null;
    }
    if (!res.ok) return null;

    const parsed = ScreenshotResponseSchema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) return null;

    const frames: RenderGameOutput["frames"] = [];
    for (const frame of parsed.data.frames) {
      const image = await downscaleDataUrl(frame.image, FRAME_BOUND);
      if (image) frames.push({ label: frame.label, image });
    }
    return {
      frames,
      ready: parsed.data.ready,
      warnings: parsed.data.warnings,
      errors: parsed.data.errors,
      ...(parsed.data.layoutIssues?.length ? { layoutIssues: parsed.data.layoutIssues } : {}),
    };
  } catch {
    return null;
  }
}
