/**
 * Fire-and-forget AI usage reporting. Records what each client-side provider
 * call cost so parents can see usage and we can track our cost basis + system
 * performance. Must NEVER throw or block an AI flow — every path is guarded and
 * the request is not awaited. The `/api/usage` route stamps `account_id` from
 * the auth token, so the client never needs (or sends) it.
 */
import { dodi } from "@/lib/api";
import type { UsageReport } from "@dodi/types/usage";

export function reportUsage(report: UsageReport, opts?: { keepalive?: boolean }): void {
  try {
    void dodi
      .request("/api/usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(report),
        keepalive: opts?.keepalive ?? false,
      })
      .catch(() => {
        /* usage tracking is best-effort — swallow network/API errors */
      });
  } catch {
    /* never let usage tracking break the app */
  }
}
