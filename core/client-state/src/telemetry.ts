/**
 * Fire-and-forget telemetry from the device. Device-run flows (the BYOK game
 * agent, the plan agent) call the AI provider directly, so their failures and
 * token usage never touch our servers on their own; these reports are the
 * only trace. Provider blindness: only error name / message (redacted and
 * truncated) and operational meta are sent, never content or keys. Nothing
 * here throws or blocks a flow.
 */
import type { ErrorLogReport } from "@dodi/types/error-logs";
import type { UsageReport } from "@dodi/types/usage";

import type { PlatformApi } from "./platform";

const MAX_MESSAGE_CHARS = 500;

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

export interface Telemetry {
  reportUsage(report: UsageReport, opts?: { keepalive?: boolean }): void;
  reportErrorLog(report: ErrorLogReport): void;
}

export function createTelemetry(api: Pick<PlatformApi, "request">): Telemetry {
  const post = (path: string, body: unknown, keepalive: boolean): void => {
    try {
      void api
        .request(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          keepalive,
        })
        .catch(() => {
          /* telemetry is best-effort: swallow network / API errors */
        });
    } catch {
      /* never let telemetry break the app */
    }
  };
  return {
    reportUsage: (report, opts) => post("/api/usage", report, opts?.keepalive ?? false),
    // The parent may close the app right after a failure: let the report outlive it.
    reportErrorLog: (report) => post("/api/error-logs", report, true),
  };
}
