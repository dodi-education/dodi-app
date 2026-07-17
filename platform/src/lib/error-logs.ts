/**
 * Server-side error logging for API routes.
 *
 * `serverErrorResponse` is the standard tail of a route's catch block: it
 * persists the error to `error_logs` (type=server, fire-and-forget, gated by
 * ERROR_LOGS) and builds the same 5xx JSON the routes returned before.
 * `logServerError` is the bare logging half for catch blocks with custom
 * response shapes (webhooks, retry loops).
 *
 * Inserts use the service-role client: server errors often occur before/without
 * a user context, and telemetry must not depend on the caller's RLS session.
 */
import { NextResponse } from "next/server";

import type { Json } from "@dodi/types/database";

import { createLogger } from "@/logger";
import { serviceClient } from "@/lib/supabase";
import { isErrorLogTypeEnabled, recordErrorLog } from "@/services/error-logs";

const log = createLogger("server-error");

export interface LogServerErrorOptions {
  /** Account attribution when the route has one (optional by design). */
  accountId?: string | null;
  /** HTTP status the route responds with. */
  httpStatus?: number | null;
  /** Extra operational context (counts/flags/ids — never content). */
  meta?: Json | null;
}

/**
 * Persist one server-side error (fire-and-forget; never throws, never blocks).
 * `scope` names the failure site, e.g. "api/games#POST".
 */
export function logServerError(
  scope: string,
  error: unknown,
  opts: LogServerErrorOptions = {},
): void {
  const errorName = error instanceof Error ? error.name : typeof error;
  // Some libs throw plain objects carrying a `message` (not Error instances).
  const errorMessage =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error && typeof error.message === "string"
        ? error.message
        : String(error);

  // Always mirror to the structured fs/console logger (dev visibility).
  log.error("server_error", {
    scope,
    errorName,
    errorMessage,
    httpStatus: opts.httpStatus ?? undefined,
  });

  if (!isErrorLogTypeEnabled("server")) return;
  try {
    void recordErrorLog(serviceClient(), {
      accountId: opts.accountId ?? null,
      type: "server",
      context: scope,
      errorName,
      errorMessage,
      httpStatus: opts.httpStatus ?? null,
      meta: opts.meta ?? null,
    }).catch(() => {
      /* error logging is best-effort — swallow DB errors */
    });
  } catch {
    /* never let error logging break a route */
  }
}

export interface ServerErrorResponseOptions extends LogServerErrorOptions {
  /** Response status (default 500). */
  status?: number;
  /** Echo `error.message` in the response body (the pre-existing behavior of
   *  most routes). Set false for routes that always return the fallback. */
  expose?: boolean;
}

/**
 * Log the error and build the route's error response. Response bodies match
 * what the hand-rolled catch blocks returned before the sweep.
 */
export function serverErrorResponse(
  error: unknown,
  fallback: string,
  scope: string,
  opts: ServerErrorResponseOptions = {},
): NextResponse {
  const status = opts.status ?? 500;
  logServerError(scope, error, { ...opts, httpStatus: status });
  const message =
    opts.expose === false
      ? fallback
      : error instanceof Error
        ? error.message
        : fallback;
  return NextResponse.json({ error: message }, { status });
}
