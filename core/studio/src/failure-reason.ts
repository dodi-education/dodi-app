import { isProviderBalanceError } from "@dodi/ai/provider-errors";

import type { ResolvedExecution } from "./ports";

/**
 * Why a plan turn or build failed, as far as the parent can act on it:
 *  - "ai_unavailable": dodi AI's own provider account refused the call (e.g.
 *    out of funds). Nothing the parent can fix; retrying now won't help.
 *  - "failed": anything else (the generic "please try again").
 */
export type StudioFailureReason = "failed" | "ai_unavailable";

export function failureReason(
  execution: Pick<ResolvedExecution, "isManaged"> | null,
  err: unknown,
): StudioFailureReason {
  return execution?.isManaged && isProviderBalanceError(err) ? "ai_unavailable" : "failed";
}
