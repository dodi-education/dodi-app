/**
 * Auth for `/api/internal/**` — the ops↔platform m2m surface. Everything under
 * the prefix is confidential and non-public by construction: the middleware
 * rejects unauthenticated requests for the whole subtree (so a new internal
 * route is protected before it writes a line of auth), and each route calls
 * {@link isInternalAuthorized} again as defense in depth — middleware has been
 * bypassable in past Next.js CVEs, and a second check is one line.
 *
 * Two credentials:
 *   - `x-ops-secret: OPS_SECRET` — the general ops m2m secret (curl, the
 *     future dodi-com/ops console, external schedulers). Opens everything
 *     under /api/internal.
 *   - `Authorization: Bearer CRON_SECRET` — what Vercel Cron sends. Deliberately
 *     scoped to the cron-triggered paths only, so a leaked cron secret cannot
 *     read the queue or stamp verdicts.
 *
 * Fail-closed: with neither env var set, every request is refused.
 */
import { constantTimeEqual, utf8ToBytes } from "@dodi/crypto";

/** Internal paths Vercel Cron may trigger with its bearer convention. */
const CRON_PATHS = new Set(["/api/internal/publications/process"]);

function matches(provided: string, expected: string | undefined): boolean {
  if (!expected) return false;
  return constantTimeEqual(utf8ToBytes(provided), utf8ToBytes(expected));
}

export function isInternalAuthorized(request: Request): boolean {
  if (matches(request.headers.get("x-ops-secret") ?? "", process.env.OPS_SECRET)) {
    return true;
  }
  const { pathname } = new URL(request.url);
  if (CRON_PATHS.has(pathname)) {
    const cron = process.env.CRON_SECRET;
    if (cron && matches(request.headers.get("authorization") ?? "", `Bearer ${cron}`)) {
      return true;
    }
  }
  return false;
}
