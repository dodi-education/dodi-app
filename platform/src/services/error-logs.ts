/**
 * Error-log telemetry — append-only persistence for errors from both sides of
 * the app, discriminated by `type`:
 *  - "client": failures of browser-run flows (the BYOK game-agent loop calls
 *    the AI provider directly, so nothing reaches our servers and mobile has
 *    no console) — reported via POST /api/error-logs.
 *  - "server": errors caught in platform API routes (see lib/error-logs.ts).
 *
 * Gated by the server-only ERROR_LOGS env var: "all" | "client" |
 * "server" | "none" (or a comma list like "client,server"); unset ⇒ all.
 *
 * Reports are sanitized client-side (key redaction) and clamped again here as
 * defense-in-depth. Only error name/message + operational meta are stored —
 * never prompts, kid content, or provider keys.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, ErrorLogInsert, Json } from "@dodi/types/database";
import type { ErrorLogType } from "@dodi/types/error-logs";

type Client = SupabaseClient<Database>;

/** Server-side caps — a report must stay a small diagnostic record. */
export const ERROR_LOG_LIMITS = {
  MESSAGE_CHARS: 1000,
  USER_AGENT_CHARS: 300,
} as const;

/** Which error types get persisted. */
export interface ErrorLogSettings {
  client: boolean;
  server: boolean;
}

/** Parse a ERROR_LOGS value. Unset/empty ⇒ everything on (telemetry is
 *  already privacy-sanitized; set "none" to opt out). */
export function parseErrorLogSettings(raw: string | undefined): ErrorLogSettings {
  const value = (raw ?? "").trim().toLowerCase();
  if (!value || value === "all") return { client: true, server: true };
  if (value === "none") return { client: false, server: false };
  const parts = value.split(",").map((p) => p.trim());
  return { client: parts.includes("client"), server: parts.includes("server") };
}

/** Whether errors of `type` should be persisted, per the env configuration. */
export function isErrorLogTypeEnabled(type: ErrorLogType): boolean {
  return parseErrorLogSettings(process.env.ERROR_LOGS)[type];
}

/** Clamp a free-text field to `max` chars (null/undefined pass through). */
export function clampText(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export interface RecordErrorLogInput {
  /** NULL for server errors caught outside a user context. */
  accountId?: string | null;
  kidId?: string | null;
  gameId?: string | null;
  type: ErrorLogType;
  /** Client flow name (game_build, …) or server scope (api/games#POST). */
  context: string;
  provider?: string | null;
  model?: string | null;
  errorName?: string | null;
  errorMessage?: string | null;
  httpStatus?: number | null;
  meta?: Json | null;
  userAgent?: string | null;
}

export async function recordErrorLog(
  supabase: Client,
  input: RecordErrorLogInput,
): Promise<{ id: string }> {
  const payload: ErrorLogInsert = {
    account_id: input.accountId ?? null,
    kid_id: input.kidId ?? null,
    game_id: input.gameId ?? null,
    type: input.type,
    context: input.context,
    provider: input.provider ?? null,
    model: input.model ?? null,
    error_name: clampText(input.errorName, 100),
    error_message: clampText(input.errorMessage, ERROR_LOG_LIMITS.MESSAGE_CHARS),
    http_status: input.httpStatus ?? null,
    meta: input.meta ?? null,
    user_agent: clampText(input.userAgent, ERROR_LOG_LIMITS.USER_AGENT_CHARS),
  };

  const { data, error } = await supabase
    .from("error_logs")
    .insert(payload)
    .select("id")
    .single();

  if (error && (input.kidId || input.gameId)) {
    // Telemetry must be resilient: a stale kid/game id (deleted meanwhile)
    // fails the FK — retry once without attribution rather than lose the report.
    const { data: retryData, error: retryError } = await supabase
      .from("error_logs")
      .insert({ ...payload, kid_id: null, game_id: null })
      .select("id")
      .single();
    if (retryError) throw retryError;
    return { id: (retryData as { id: string }).id };
  }

  if (error) throw error;
  return { id: (data as { id: string }).id };
}
