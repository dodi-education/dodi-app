import type { VaultSession } from "@dodi/vault";

import { clientState } from "@/lib/client-state";

/**
 * Resolve once the vault has an unlocked session (waits out a cold-load silent
 * unlock; rejects when the vault settles locked). See `@dodi/client-state`.
 */
export function awaitSession(): Promise<VaultSession> {
  return clientState.awaitSession();
}
