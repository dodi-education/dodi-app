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
import { dodi } from "@/lib/api";
import type { ErrorLogMeta, ErrorLogReport } from "@dodi/types/error-logs";

const MAX_MESSAGE_CHARS = 500;

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
  return {
    durationMs: Date.now() - startedAt,
    online: typeof navigator === "undefined" ? undefined : navigator.onLine,
    visibility: typeof document === "undefined" ? undefined : document.visibilityState,
    ...extra,
  };
}

// Key-shaped content never belongs in telemetry. The catch-all (32+ token
// chars) also eats UUIDs/request-ids — acceptable: we redact too much rather
// than risk a provider key or bearer surviving in an error message.
const REDACT_PATTERNS: RegExp[] = [
  /sk-ant-[\w-]+/g,
  /xai-[\w-]+/g,
  /Bearer\s+\S+/gi,
  /[\w-]{32,}/g,
];

/** Strip secrets/token-shaped runs from an error message. */
export function redactSecrets(text: string, secrets: string[] = []): string {
  let out = text;
  for (const secret of secrets) {
    if (secret) out = out.split(secret).join("[REDACTED]");
  }
  for (const pattern of REDACT_PATTERNS) {
    out = out.replace(pattern, "[REDACTED]");
  }
  return out;
}

export interface DescribedError {
  errorName: string;
  errorMessage: string;
  httpStatus: number | null;
}

/**
 * Shape an unknown thrown value into the report's error fields. `secrets` are
 * values that must never appear in the message (e.g. the vault-decrypted
 * provider key), scrubbed on top of the pattern redaction.
 */
export function describeError(err: unknown, secrets: string[] = []): DescribedError {
  const name = err instanceof Error ? err.name : typeof err;
  const rawMessage =
    err instanceof Error ? err.message : typeof err === "string" ? err : String(err);
  // Provider SDK errors (Anthropic/OpenAI APIError) carry the HTTP status.
  const status =
    err && typeof err === "object" && "status" in err && typeof err.status === "number"
      ? err.status
      : null;

  const message = redactSecrets(rawMessage, secrets);
  return {
    errorName: name.slice(0, 100),
    errorMessage:
      message.length > MAX_MESSAGE_CHARS ? `${message.slice(0, MAX_MESSAGE_CHARS)}…` : message,
    httpStatus: status,
  };
}

export function reportErrorLog(report: ErrorLogReport): void {
  try {
    void dodi
      .request("/api/error-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(report),
        // The parent may close the tab right after a failure — let the report
        // outlive the page.
        keepalive: true,
      })
      .catch(() => {
        /* error reporting is best-effort — swallow network/API errors */
      });
  } catch {
    /* never let error reporting break the app */
  }
}
