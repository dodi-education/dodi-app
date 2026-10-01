/**
 * The account's thinking provider, model and vault-decrypted key, resolved in the
 * browser (keys live only in the unlocked vault). Null when no thinking model is
 * configured or no key is available. Logic: `@dodi/client-state`.
 */
import type { ResolvedExecution } from "@dodi/client-state";

import { clientState } from "@/lib/client-state";

export type ResolvedClientThinking = ResolvedExecution;

export function resolveClientThinking(): Promise<ResolvedClientThinking | null> {
  return clientState.execution.resolveThinking();
}
