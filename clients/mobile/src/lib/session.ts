/**
 * Whether this device holds a sign-in. Read once at launch (the token sits in
 * the Keychain / Keystore); sign-in and sign-out update it.
 */
import { createStore } from "zustand/vanilla";
import { bindStore } from "@dodi/client-state/react";

import { loadAccessToken, signOut as revokeSession } from "@/adapters/auth";
import { offlineCache } from "@/adapters/offline-cache";
import { clientState } from "@/lib/client-state";

interface SessionState {
  isLoaded: boolean;
  isSignedIn: boolean;
}

const sessionStore = createStore<SessionState>()(() => ({ isLoaded: false, isSignedIn: false }));

export const useSession = bindStore(sessionStore);

/** Launch: restore the token, and start the silent vault unlock right away. */
export async function restoreSession(): Promise<void> {
  const token = await loadAccessToken();
  sessionStore.setState({ isLoaded: true, isSignedIn: Boolean(token) });
  if (token) void clientState.vault.getState().unlockSilently();
}

/** A sign-in flow stored a fresh token. */
export function markSignedIn(): void {
  sessionStore.setState({ isSignedIn: true });
}

/**
 * Sign out: wipe the offline cache (as the web does: another account on this
 * device never inherits cached ciphertext rows, parked autosaves or the sealed
 * vault keys), revoke, lock the vault, and drop every cached plaintext.
 */
export async function signOut(): Promise<void> {
  await offlineCache.clearAll();
  await revokeSession();
  clientState.vault.getState().lock();
  clientState.kids.getState().invalidate();
  clientState.games.getState().invalidate();
  clientState.account.getState().reset();
  clientState.providers.getState().invalidate();
  clientState.dodiAIKeys.getState().clear();
  sessionStore.setState({ isSignedIn: false });
}
