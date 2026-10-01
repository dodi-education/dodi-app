/**
 * The web client's adapters for the headless Game Studio build
 * (`@dodi/studio`): canvas raster work, the browser vault and its provider
 * keys, IndexedDB checkpoints, the account's screenshot service and the
 * platform's telemetry endpoints. The build logic itself lives in core.
 */

import type { BuildRenderer, StudioPorts } from "@dodi/studio/ports";

import { dodi } from "@/lib/api";
import { resolveClientGame } from "@/lib/ai/resolve-client-game";
import { resolveClientImage } from "@/lib/ai/resolve-client-image";
import {
  browserEnvironmentMeta,
  describeError,
  reportErrorLog,
} from "@/lib/errors/report-error-log";
import { browserCheckpointStore } from "@/lib/games/build-checkpoint-store";
import {
  captureGameFrames,
  isDodiScreenshotServiceUnavailable,
  type ScreenshotTarget,
} from "@/lib/games/screenshot-service";
import { downscaleDataUrl, squareThumbnailDataUrl } from "@/lib/games/thumbnail";
import { reportUsage } from "@/lib/usage/report-usage";
import { gameScreenshotServiceOf, useAccountStore } from "@/stores/account-store";
import { awaitSession } from "@/stores/await-session";
import { useGameStore } from "@/stores/game-store";
import { useVaultStore } from "@/stores/vault-store";

/**
 * Which screenshot service a build may use, from the account setting.
 * "custom" needs the unlocked vault to open the sealed URL; anything that
 * cannot be resolved means no visual check this build.
 */
function resolveScreenshotTarget(): ScreenshotTarget | null {
  const setting = gameScreenshotServiceOf(useAccountStore.getState().account);
  if (setting.mode === "dodi") {
    return isDodiScreenshotServiceUnavailable() ? null : { mode: "dodi" };
  }
  if (setting.mode === "custom" && setting.customUrlEnc) {
    const session = useVaultStore.getState().session;
    if (!session) return null;
    try {
      const url = session.decryptField(setting.customUrlEnc);
      return url ? { mode: "custom", url } : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * The sandbox document goes to the configured service and real frames come
 * back for the model to look at. This is the moment game code leaves the
 * browser, and the only one.
 */
function createRenderer(target: ScreenshotTarget): BuildRenderer {
  let isServiceUnavailable = false;
  return {
    viewGame: async (input) => {
      const output = await captureGameFrames(input, target);
      if (!output && isDodiScreenshotServiceUnavailable()) isServiceUnavailable = true;
      return output;
    },
    wasServiceUnavailable: () => isServiceUnavailable,
  };
}

export function createWebStudioPorts(): StudioPorts {
  return {
    api: dodi,
    session: awaitSession,
    images: {
      downscale: (dataUrl, bound) => downscaleDataUrl(dataUrl, bound),
      squareThumbnail: (dataUrl, size) => squareThumbnailDataUrl(dataUrl, size),
    },
    execution: { resolveGame: resolveClientGame, resolveImage: resolveClientImage },
    screenshots: {
      forBuild: () => {
        const target = resolveScreenshotTarget();
        return target ? createRenderer(target) : null;
      },
    },
    telemetry: {
      reportUsage: (report) => reportUsage(report),
      reportError: ({ error, secrets, meta, context, ...report }) => {
        if (context !== "game_save") console.error("[game-studio] build failed", error);
        reportErrorLog({
          ...report,
          context,
          ...describeError(error, secrets),
          ...(meta ? { meta: { ...meta, ...browserEnvironmentMeta() } } : {}),
        });
      },
    },
    games: {
      put: (row) => useGameStore.getState().put(row),
      patchLocal: (gameId, patch) => useGameStore.getState().patchLocal(gameId, patch),
    },
    checkpoints: browserCheckpointStore(),
  };
}
