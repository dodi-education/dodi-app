/**
 * The web client's adapters for the headless Game Studio build
 * (`@dodi/studio`): canvas raster work, the browser vault and its provider
 * keys, IndexedDB checkpoints, the account's screenshot service and the
 * platform's telemetry endpoints. The build logic itself lives in core.
 */

import { createTelemetry } from "@dodi/client-state/telemetry";
import type { StudioEditorPorts, StudioPorts, StudioTelemetry } from "@dodi/studio/ports";
import { createScreenshotService } from "@dodi/studio/screenshot-service";
import { createStudioTelemetry } from "@dodi/studio/telemetry";

import { dodi } from "@/lib/api";
import { resolveClientGame } from "@/lib/ai/resolve-client-game";
import { resolveClientImage } from "@/lib/ai/resolve-client-image";
import { clientState } from "@/lib/client-state";
import { browserEnvironmentMeta } from "@/lib/errors/report-error-log";
import { browserCheckpointStore } from "@/lib/games/build-checkpoint-store";
import { downscaleDataUrl, squareThumbnailDataUrl } from "@/lib/games/thumbnail";
import { useAccountStore } from "@/stores/account-store";
import { awaitSession } from "@/stores/await-session";
import { useGameStore } from "@/stores/game-store";
import { useVaultStore } from "@/stores/vault-store";

/** The account's screenshot service (shared client: @dodi/studio/screenshot-service). */
export const screenshotService = createScreenshotService({
  api: dodi,
  fetch: (input, init) => fetch(input, init),
  images: {
    downscale: (dataUrl, bound) => downscaleDataUrl(dataUrl, bound),
    squareThumbnail: (dataUrl, size) => squareThumbnailDataUrl(dataUrl, size),
  },
  setting: () => useAccountStore.getState().account?.game_screenshot_service,
  session: () => useVaultStore.getState().session,
});

function webStudioTelemetry(): StudioTelemetry {
  return createStudioTelemetry(
    createTelemetry(dodi),
    browserEnvironmentMeta,
    (message, error) => console.error(message, error),
  );
}

export function createWebStudioPorts(): StudioPorts {
  return {
    api: dodi,
    session: awaitSession,
    images: {
      downscale: (dataUrl, bound) => downscaleDataUrl(dataUrl, bound),
      squareThumbnail: (dataUrl, size) => squareThumbnailDataUrl(dataUrl, size),
    },
    execution: {
      resolveGame: resolveClientGame,
      resolveImage: resolveClientImage,
      refreshKeys: () => clientState.execution.refreshKeys(),
    },
    screenshots: screenshotService,
    telemetry: webStudioTelemetry(),
    games: {
      put: (row) => useGameStore.getState().put(row),
      patchLocal: (gameId, patch) => useGameStore.getState().patchLocal(gameId, patch),
    },
    checkpoints: browserCheckpointStore(),
  };
}

let editorPorts: StudioEditorPorts | null = null;

/** The studio editor's ports (plan turns, settings, versions); one per tab. */
export function webStudioEditorPorts(): StudioEditorPorts {
  editorPorts ??= {
    api: dodi,
    session: awaitSession,
    currentSession: () => useVaultStore.getState().session,
    execution: {
      resolveGame: resolveClientGame,
      resolveImage: resolveClientImage,
      refreshKeys: () => clientState.execution.refreshKeys(),
    },
    telemetry: webStudioTelemetry(),
    games: {
      put: (row) => useGameStore.getState().put(row),
      patchLocal: (gameId, patch) => useGameStore.getState().patchLocal(gameId, patch),
      invalidate: () => useGameStore.getState().invalidate(),
    },
  };
  return editorPorts;
}
