/**
 * Fire-and-forget error-log reporting from the browser. Browser-run flows (the
 * BYOK game agent) call the AI provider directly, so their failures never
 * touch our servers — and on mobile there is no console to read. This posts a
 * sanitized failure report so `/api/error-logs` can persist it (type=client)
 * for debugging.
 *
 * Provider blindness: only error name/message + operational meta are sent.
 * Messages are redacted (key-shaped tokens, known secrets) and truncated
 * before leaving the tab. Must NEVER throw or block a flow — every path is
 * guarded and the request is not awaited.
 */
import { createTelemetry } from "@dodi/client-state/telemetry";

import { dodi } from "@/lib/api";
import type { ErrorLogMeta, ErrorLogReport } from "@dodi/types/error-logs";

const telemetry = createTelemetry(dodi);

/** Wall-clock timer start for `browserFailureMeta`. Lives here (a plain
 *  module) so component event handlers stay clear of the purity lint. */
export function startFailureTimer(): number {
  return Date.now();
}

/**
 * Snapshot the browser environment at failure time. `online: false` points to
 * a dropped connection; `visibility: "hidden"` to a backgrounded tab (mobile
 * screen lock kills in-flight fetches) — the two main mobile failure modes.
 */
export function browserFailureMeta(
  startedAt: number,
  extra: ErrorLogMeta = {},
): ErrorLogMeta {
  return { durationMs: Date.now() - startedAt, ...browserEnvironmentMeta(), ...extra };
}

/** The connectivity + tab-visibility half of `browserFailureMeta`. */
export function browserEnvironmentMeta(): Pick<ErrorLogMeta, "online" | "visibility"> {
  return {
    online: typeof navigator === "undefined" ? undefined : navigator.onLine,
    visibility: typeof document === "undefined" ? undefined : document.visibilityState,
  };
}

export { describeError, type DescribedError, redactSecrets } from "@dodi/client-state/telemetry";

export function reportErrorLog(report: ErrorLogReport): void {
  telemetry.reportErrorLog(report);
}
