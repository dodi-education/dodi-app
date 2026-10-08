import { signOut } from "@/lib/auth/client";
import { offlineCache } from "@/lib/offline/offline-cache";
import { clearParentUnlocked } from "@/lib/parent-lock";
import { useAccountStore } from "@/stores/account-store";
import { useDodiAIBillingStore } from "@/stores/dodi-ai-billing-store";
import { useDodiAIKeyStore } from "@/stores/dodi-ai-key-store";
import { useKidStore } from "@/stores/kid-store";

/**
 * Sign out of this browser: drop the in-memory caches (sign-out is an SPA
 * navigation, so a later login, possibly of another account, must never see
 * stale data), wipe the offline cache, then revoke the session and drop the
 * token. Shared by the Sign out button and account deletion.
 */
export async function endSession(): Promise<void> {
  clearParentUnlocked();
  useAccountStore.getState().reset();
  useKidStore.getState().invalidate();
  // dodi AI session credentials live in memory only: drop them with the session.
  useDodiAIKeyStore.getState().clear();
  useDodiAIBillingStore.getState().clear();
  // Offline caches persist in IndexedDB: wipe them so another account on this
  // device never inherits cached (ciphertext) rows or vault keys.
  await offlineCache.clearAll();
  await signOut();
}

/** IndexedDB databases a deleted account leaves behind (dodi-offline is cleared by `endSession`). */
const ACCOUNT_DATABASES = ["dodi-vault", "dodi-sealed-secret", "dodi-studio"];
/** UI-state cookies that name the deleted account's kids or view. */
const ACCOUNT_COOKIES = ["dodi-active-kid", "dodi-kid-locale", "dodi-view"];

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * After the account is deleted, also remove what a plain sign-out keeps for
 * the next sign-in on this device: the device keystore, sealed build
 * checkpoints, pending transcript and play outboxes, per-kid flags and UI
 * cookies. Everything here belongs to the deleted account and is useless
 * without it. Best effort; the interface language cookie stays.
 */
export async function wipeDeviceData(): Promise<void> {
  for (const storage of [window.localStorage, window.sessionStorage]) {
    for (const key of Object.keys(storage)) {
      if (key.startsWith("dodi-")) storage.removeItem(key);
    }
  }
  for (const name of ACCOUNT_COOKIES) {
    document.cookie = `${name}=; path=/; max-age=0`;
  }
  await Promise.all(ACCOUNT_DATABASES.map(deleteDatabase));
}
