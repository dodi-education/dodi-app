/**
 * The app's adapters for the headless Game Studio build (`@dodi/studio`):
 * native raster work, the device vault and its provider keys, file-backed
 * checkpoints, the account's screenshot service and the platform's telemetry
 * endpoints. The web wires the same ports in `lib/games/studio-ports.ts`.
 */
import { AppState } from "react-native";
import { createTelemetry } from "@dodi/client-state/telemetry";
import type { StudioEditorPorts, StudioPorts, StudioTelemetry } from "@dodi/studio/ports";
import { createScreenshotService } from "@dodi/studio/screenshot-service";
import { createStudioTelemetry } from "@dodi/studio/telemetry";
import type { ErrorLogMeta } from "@dodi/types/error-logs";

import { clientState } from "@/lib/client-state";

import { fileCheckpointStore } from "./checkpoint-store";
import { cookielessFetch } from "./http";
import { nativeImageOps } from "./image-ops";
import { api } from "./platform";

/** The account's screenshot service (shared client: @dodi/studio/screenshot-service). */
export const screenshotService = createScreenshotService({
  api,
  fetch: cookielessFetch,
  images: nativeImageOps,
  setting: () => clientState.account.getState().account?.game_screenshot_service,
  session: () => clientState.vault.getState().session,
});

/** Connectivity and app state at failure time (the web reports tab visibility). */
function appEnvironmentMeta(): Pick<ErrorLogMeta, "online" | "visibility"> {
  return {
    online: clientState.connectivity.getState().isOnline,
    visibility: AppState.currentState,
  };
}

let telemetry: StudioTelemetry | null = null;

function studioTelemetry(): StudioTelemetry {
  telemetry ??= createStudioTelemetry(createTelemetry(api), appEnvironmentMeta, (message, error) =>
    console.error(message, error),
  );
  return telemetry;
}

const games = {
  put: (row: Parameters<StudioPorts["games"]["put"]>[0]) => clientState.games.getState().put(row),
  patchLocal: (gameId: string, patch: Parameters<StudioPorts["games"]["patchLocal"]>[1]) =>
    clientState.games.getState().patchLocal(gameId, patch),
};

export function createMobileStudioPorts(): StudioPorts {
  return {
    api,
    session: clientState.awaitSession,
    images: nativeImageOps,
    execution: clientState.execution,
    screenshots: screenshotService,
    telemetry: studioTelemetry(),
    games,
    checkpoints: fileCheckpointStore,
  };
}

/** The editor's ports (plan turns, settings, versions, code edits). */
export const mobileStudioEditorPorts: StudioEditorPorts = {
  api,
  session: clientState.awaitSession,
  currentSession: () => clientState.vault.getState().session,
  execution: clientState.execution,
  get telemetry() {
    return studioTelemetry();
  },
  games: { ...games, invalidate: () => clientState.games.getState().invalidate() },
};
