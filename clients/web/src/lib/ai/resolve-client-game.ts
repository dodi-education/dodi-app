/**
 * The account's game provider, model and vault-decrypted key, resolved in the
 * browser (keys live only in the unlocked vault). Null when no game model is
 * configured or no key is available. Logic: `@dodi/client-state`.
 */
import type { ResolvedExecution } from "@dodi/client-state";

import { clientState } from "@/lib/client-state";

export type ResolvedClientGame = ResolvedExecution;

export function resolveClientGame(): Promise<ResolvedClientGame | null> {
  return clientState.execution.resolveGame();
}
