/**
 * Next.js instrumentation — `onRequestError` fires for errors that escape a
 * route handler entirely (the in-route catch blocks call serverErrorResponse
 * themselves and never reach this). Persisted to `error_logs` (type=server,
 * gated by ERROR_LOGS) so uncaught crashes are as visible as handled ones.
 */
import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Dynamic import: instrumentation is loaded in every runtime; only pull the
  // supabase-backed logger where it actually runs.
  const { logServerError } = await import("@/lib/error-logs");
  logServerError(`uncaught:${context.routePath || request.path}`, err, {
    meta: { method: request.method, routerKind: context.routerKind },
  });
};
