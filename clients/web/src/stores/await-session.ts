import type { VaultSession } from "@dodi/vault";

import { useVaultStore } from "./vault-store";

/**
 * Resolve once the vault has an unlocked session. On a cold load the silent
 * unlock runs in parallel with the first fetch, so the session may still be null
 * when a store gets here — wait for it instead of throwing. Reject if the vault
 * settles into a terminal state without a session (unlock failed), so callers
 * don't hang forever.
 *
 * Shared by every decrypt-once cache (kids, games, …).
 */
export function awaitSession(): Promise<VaultSession> {
  const { session, status } = useVaultStore.getState();
  if (session) return Promise.resolve(session);
  // Already settled without a session (unlock failed / no vault) — fail now
  // rather than subscribe and wait for a state change that will never come.
  if (status === "locked" || status === "needs-setup") {
    return Promise.reject(new Error("Vault is locked"));
  }

  return new Promise<VaultSession>((resolve, reject) => {
    const unsubscribe = useVaultStore.subscribe((state) => {
      if (state.session) {
        unsubscribe();
        resolve(state.session);
      } else if (state.status === "locked" || state.status === "needs-setup") {
        unsubscribe();
        reject(new Error("Vault is locked"));
      }
    });
  });
}
