/**
 * The client side of the screenshot service (the Game Studio's visual check):
 * turn a game bundle into the exact sandbox document the apps load
 * (`buildSandboxSrcDoc`), post it to the configured service, and hand real
 * frames back to the agent loop. Two interchangeable targets: the platform's
 * proxy for dodi's worker (authenticated), or a parent's own service at a
 * custom URL (plain CORS fetch, no credentials). Either way the reply is
 * validated against the contract and every frame is re-encoded at the
 * studio's screenshot bound, because a custom service is untrusted.
 *
 * Never throws: null means "no frames", and the loop carries on without a
 * visual check.
 */
import type { RenderGameInput, RenderGameOutput } from "@dodi/ai/game-agent-tools";
import { buildSandboxSrcDoc } from "@dodi/games/sandbox-doc";
import {
  DEFAULT_SCREENSHOT_VIEWPORT,
  parseGameScreenshotServiceSettings,
  SCREENSHOT_CONTRACT_VERSION,
  ScreenshotResponseSchema,
  type ScreenshotRequest,
} from "@dodi/games/screenshot-contract";
import type { Json } from "@dodi/types/database";
import type { VaultSession } from "@dodi/vault";

import { SCREENSHOT_BOUND } from "./build-runner";
import type { BuildRenderer, ImageOps, ScreenshotPort, StudioApi } from "./ports";

export type ScreenshotTarget = { mode: "dodi" } | { mode: "custom"; url: string };

/** Worker deadline (20 s) plus proxy and transfer headroom. */
const CAPTURE_TIMEOUT_MS = 25_000;

export interface ScreenshotServiceDeps {
  api: StudioApi;
  /** For a parent's custom service (no credentials). */
  fetch: typeof fetch;
  images: ImageOps;
  /** The account's `game_screenshot_service` column (sealed custom URL inside). */
  setting: () => Json | null | undefined;
  /** The unlocked vault, to open a custom URL; null while locked. */
  session: () => VaultSession | null;
}

export interface ScreenshotService extends ScreenshotPort {
  captureGameFrames(input: RenderGameInput, target: ScreenshotTarget): Promise<RenderGameOutput | null>;
  resolveTarget(): ScreenshotTarget | null;
  /** dodi's worker answered 503 this session (no worker configured, or down). */
  isDodiServiceUnavailable(): boolean;
}

export function createScreenshotService(deps: ScreenshotServiceDeps): ScreenshotService {
  // Remembered for the session so the studio neither keeps asking nor nags
  // about it on every build; a restart tries again.
  let isDodiUnavailable = false;

  const resolveTarget = (): ScreenshotTarget | null => {
    const setting = parseGameScreenshotServiceSettings(deps.setting());
    if (setting.mode === "dodi") return isDodiUnavailable ? null : { mode: "dodi" };
    if (setting.mode === "custom" && setting.customUrlEnc) {
      const session = deps.session();
      if (!session) return null;
      try {
        const url = session.decryptField(setting.customUrlEnc);
        return url ? { mode: "custom", url } : null;
      } catch {
        return null;
      }
    }
    return null;
  };

  const captureGameFrames = async (
    input: RenderGameInput,
    target: ScreenshotTarget,
  ): Promise<RenderGameOutput | null> => {
    if (target.mode === "dodi" && isDodiUnavailable) return null;
    const request: ScreenshotRequest = {
      version: SCREENSHOT_CONTRACT_VERSION,
      document: buildSandboxSrcDoc(input.code),
      viewport: DEFAULT_SCREENSHOT_VIEWPORT,
      steps: input.steps.map((step) => ({ label: step.label, command: step.command })),
    };
    const init = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(CAPTURE_TIMEOUT_MS),
    };
    try {
      const res =
        target.mode === "dodi"
          ? await deps.api.request("/api/games/screenshot", init)
          : await deps.fetch(target.url, { ...init, mode: "cors", credentials: "omit" });
      if (target.mode === "dodi" && res.status === 503) {
        isDodiUnavailable = true;
        return null;
      }
      if (!res.ok) return null;
      const parsed = ScreenshotResponseSchema.safeParse(await res.json().catch(() => null));
      if (!parsed.success) return null;
      const frames: RenderGameOutput["frames"] = [];
      for (const frame of parsed.data.frames) {
        const image = await deps.images.downscale(frame.image, SCREENSHOT_BOUND);
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
  };

  return {
    captureGameFrames,
    resolveTarget,
    isDodiServiceUnavailable: () => isDodiUnavailable,
    forBuild: (): BuildRenderer | null => {
      const target = resolveTarget();
      if (!target) return null;
      let wasUnavailable = false;
      return {
        viewGame: async (input) => {
          const output = await captureGameFrames(input, target);
          if (!output && isDodiUnavailable) wasUnavailable = true;
          return output;
        },
        wasServiceUnavailable: () => wasUnavailable,
      };
    },
  };
}
