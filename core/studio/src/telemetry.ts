import { describeError, type Telemetry } from "@dodi/client-state/telemetry";
import type { ErrorLogMeta } from "@dodi/types/error-logs";

import type { StudioTelemetry } from "./ports";

/**
 * The build's telemetry port over the shared reporter. `environment` adds the
 * client's own facts at failure time (web: online / tab visibility; mobile:
 * app state).
 */
export function createStudioTelemetry(
  telemetry: Telemetry,
  environment: () => ErrorLogMeta = () => ({}),
  log: (message: string, error: unknown) => void = () => {},
): StudioTelemetry {
  return {
    reportUsage: (report) => telemetry.reportUsage(report),
    reportError: ({ error, secrets, meta, context, ...report }) => {
      if (context === "game_plan") log("[game-studio] plan turn failed", error);
      else if (context !== "game_save") log("[game-studio] build failed", error);
      telemetry.reportErrorLog({
        ...report,
        context,
        ...describeError(error, secrets),
        ...(meta ? { meta: { ...meta, ...environment() } } : {}),
      });
    },
  };
}
