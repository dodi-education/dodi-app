/**
 * Error-log DTOs — shared between the browser (which reports failures of
 * client-side flows) and the platform (which persists them and adds its own
 * server-side errors to the same `error_logs` table).
 *
 * Browser-run flows (the BYOK game-agent loop) call the AI provider directly,
 * so when they fail nothing reaches our servers — these reports are the only
 * way to debug them. They carry error name/message + operational diagnostics
 * only; never prompts, kid content, or provider keys (the reporter redacts
 * key-shaped tokens before sending), so provider blindness is preserved.
 *
 * Whether reports are persisted is controlled by the server-only
 * `ERROR_LOGS` env var (all | client | server | none; unset ⇒ all).
 */

/** Where the error happened: reported by a browser, or caught on the server. */
export type ErrorLogType = "client" | "server";

/** Which client-side flow failed. Extend as more flows adopt reporting.
 *  (Server errors use a free-form scope string instead, e.g. "api/games#POST".) */
export type ErrorLogContext = "game_build" | "game_update" | "game_save";

/** Operational diagnostics captured at the moment of failure. Counts, flags
 *  and enum-ish strings only — never content. */
export interface ErrorLogMeta {
  /** Last agent progress step emitted before the failure (e.g. writing_code). */
  lastStep?: string;
  /** Wall-clock ms from send to failure. */
  durationMs?: number;
  /** navigator.onLine at failure time (false ⇒ network drop). */
  online?: boolean;
  /** document.visibilityState at failure time (hidden ⇒ tab was backgrounded). */
  visibility?: string;
  /** Model round-trips completed before the failure. */
  turns?: number;
  /** Provider stop/finish reason of the last model turn (max_tokens ⇒ truncation). */
  stopReason?: string;
  /** The agent produced at least one tool call before failing. */
  sawToolCalls?: boolean;
  /** The agent produced plain text before failing. */
  sawText?: boolean;
}

/**
 * What the client POSTs to /api/error-logs after a client-side flow fails.
 * `type` ("client"), `account_id` and `user_agent` are stamped by the route —
 * never sent by the client.
 */
export interface ErrorLogReport {
  context: ErrorLogContext;
  kidId?: string | null;
  gameId?: string | null;
  provider?: string;
  model?: string;
  /** Error constructor name (e.g. APIConnectionError, GameAgentError). */
  errorName?: string;
  /** Redacted + truncated error message (see report-error-log.ts). */
  errorMessage?: string;
  /** HTTP status for provider API errors (401/429/529/…), if any. */
  httpStatus?: number | null;
  meta?: ErrorLogMeta;
}
