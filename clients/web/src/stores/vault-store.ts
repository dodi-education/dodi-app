/**
 * Client vault orchestration. Holds the in-memory `VaultSession` for the tab and
 * coordinates device keys, the wrapped-key endpoint, and the crypto layer.
 *
 * Flow:
 *  - register  → bootstrap(password): create vault, store wraps, show nsec
 *  - login     → unlockOrBootstrap(password)
 *  - app load  → unlockSilently(): device key unwraps the VMK with no prompt
 *  - new device→ unlockWithPassword / unlockWithNsec (then self-registers)
 */
import { create } from "zustand";

// Side effect: in the browser, route Argon2id through a Web Worker so key
// derivation during unlock/wrap never blocks the UI thread.
import "@/lib/argon2-worker";
import {
  deriveVaultMasterKeyFromNsec,
  nsecToNpubHex,
  toBase64Url,
} from "@dodi/crypto";
import {
  type DeviceRegistration,
  type StoredDevice,
  type StoredVaultKeys,
  VaultSession,
  addDeviceToVault,
  createAccountVault,
  createIndexedDbDeviceKeystore,
  getOrCreateDevice,
  removeDeviceFromVault,
  setVaultPassword,
  unlockVaultWithDevice,
  unlockVaultWithNsec,
  unlockVaultWithPassword,
} from "@dodi/vault";
import { offlineCache } from "@/lib/offline/offline-cache";
import { clearParentUnlocked, markParentUnlocked } from "@/lib/parent-lock";
import {
  clearSealedSecret,
  consumeSealedSecret,
  stashSealedSecret,
} from "@/lib/sealed-secret";
import { fetchVaultKeys, saveVaultKeys } from "@/lib/vault-client";
import { useConnectivityStore } from "@/stores/connectivity-store";

export type VaultStatus =
  "idle" | "working" | "unlocked" | "locked" | "needs-setup";

interface VaultStoreState {
  status: VaultStatus;
  session: VaultSession | null;
  /** Set after bootstrap; shown once on the account-key screen, then cleared. */
  pendingNsec: string | null;
  /**
   * In-memory only (NEVER persisted): the vault built at registration, awaiting
   * the emailed OTP. `finalizeVault` persists it once the code establishes a
   * session; retained across a failed save so a retry needs no re-verify.
   */
  pendingVault: { storedKeys: StoredVaultKeys; nsec: string } | null;
  error: string | null;

  bootstrap: (password: string, importedNsec?: string) => Promise<void>;
  /**
   * Register (email-OTP) split of bootstrap: build the vault in memory from the
   * password and seal it locally — NO server write, NO session. The caller drops
   * the password immediately after this resolves.
   */
  createLocalVault: (password: string, importedNsec?: string) => Promise<void>;
  /**
   * After the OTP code establishes a session: persist the sealed vault, activate
   * the session, and reveal the nsec account key. Retry-safe on a failed save.
   */
  finalizeVault: () => Promise<void>;
  /** Drop the pending local vault + sealed blob (e.g. "use a different email"). */
  discardLocalVault: () => Promise<void>;
  unlockOrBootstrap: (password: string) => Promise<{ created: boolean }>;
  unlockWithPassword: (password: string) => Promise<void>;
  unlockWithNsec: (nsec: string) => Promise<void>;
  unlockSilently: () => Promise<boolean>;
  /**
   * Cold forgot-password reset: verify the nsec account key, re-wrap the vault
   * under the new password, and unlock this device. `onVerified` runs AFTER the
   * nsec checks out but BEFORE the vault is re-wrapped — the caller uses it to
   * update the Supabase auth password, so a wrong nsec never mutates auth and
   * the two stay in sync.
   */
  resetPasswordWithNsec: (
    nsec: string,
    newPassword: string,
    onVerified: () => Promise<void>,
  ) => Promise<void>;
  /**
   * Warm reset from an already-unlocked session (trusted device): rotate the
   * password wrap using the in-memory VMK — no old password or phrase needed.
   */
  changePassword: (newPassword: string) => Promise<void>;
  /**
   * Pair another device: wrap the in-memory VMK to its KEM public key and
   * persist the updated keys. Requires an unlocked vault. Call after the device
   * is claimed (so we have its deviceId + KEM key) and before activating it.
   */
  addDevice: (device: DeviceRegistration) => Promise<void>;
  /** Revoke a device's vault access: drop its wrap and persist (no VMK needed). */
  removeDevice: (deviceId: string) => Promise<void>;
  acknowledgeNsec: () => void;
  lock: () => void;
}

function loadDevice(): Promise<StoredDevice> {
  return getOrCreateDevice(createIndexedDbDeviceKeystore());
}

function deviceRegistration(device: StoredDevice) {
  return {
    deviceId: device.deviceId,
    deviceKemPublicKey: toBase64Url(device.kem.publicKey),
  };
}

/** Authorize this device against the vault if it isn't already (so next load unlocks silently). */
async function ensureDeviceRegistered(
  keys: StoredVaultKeys,
  vmk: Uint8Array,
  opts?: { npub?: string },
): Promise<void> {
  const device = await loadDevice();
  if (keys.deviceWraps.some((d) => d.deviceId === device.deviceId)) return;
  await saveVaultKeys(
    addDeviceToVault(keys, vmk, deviceRegistration(device)),
    opts,
  );
}

export const useVaultStore = create<VaultStoreState>((set, get) => {
  /**
   * Shared password-unlock tail (login + unlock prompt): unwrap the VMK and
   * activate the session. Device registration only matters for the NEXT
   * visit's silent unlock, so it runs in the background instead of gating the
   * login on its extra round trip — if it fails, the next load just asks for
   * the password again.
   */
  const unlockWithKeys = async (
    keys: StoredVaultKeys,
    password: string,
  ): Promise<void> => {
    try {
      const vmk = await unlockVaultWithPassword(keys, password);
      void ensureDeviceRegistered(keys, vmk).catch(() => {});
      set({ session: new VaultSession(vmk), status: "unlocked" });
      // Strong-auth (password/phrase) ⇒ open the parent area for this session.
      markParentUnlocked();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unlock failed";
      set({ status: "locked", error: message });
      throw error;
    }
  };

  return {
    status: "idle",
    session: null,
    pendingNsec: null,
    pendingVault: null,
    error: null,

    bootstrap: async (password, importedNsec) => {
      set({ status: "working", error: null });
      try {
        const device = await loadDevice();
        const { nsec, npubHex, vmk, storedKeys } = await createAccountVault({
          password,
          device: deviceRegistration(device),
          importedNsec,
        });
        await saveVaultKeys(storedKeys, { npub: npubHex });
        set({
          session: new VaultSession(vmk),
          pendingNsec: nsec,
          status: "unlocked",
        });
        markParentUnlocked();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Vault setup failed";
        set({ status: "needs-setup", error: message });
        throw error;
      }
    },

    createLocalVault: async (password, importedNsec) => {
      // Build the vault in memory and seal it for the OTP window. No server write
      // (there's no session yet) and no status change (the user is still on the
      // public /register page, outside VaultGate). The device key is created here
      // and wrapped into storedKeys, so silent unlock works after finalize. The
      // seal holds only the one-way passwordWrap + nsec, never the password.
      const device = await loadDevice();
      const { nsec, storedKeys } = await createAccountVault({
        password,
        device: deviceRegistration(device),
        importedNsec,
      });
      await stashSealedSecret(JSON.stringify({ storedKeys, nsec }));
    },

    finalizeVault: async () => {
      set({ status: "working", error: null });
      try {
        // Prefer the in-memory copy (set below on the first attempt) so a retry
        // after a failed save doesn't depend on the already-wiped seal.
        let data = get().pendingVault;
        if (!data) {
          const raw = await consumeSealedSecret();
          if (!raw) throw new Error("registration-seal-missing");
          data = JSON.parse(raw) as {
            storedKeys: StoredVaultKeys;
            nsec: string;
          };
          set({ pendingVault: data });
        }
        await saveVaultKeys(data.storedKeys, {
          npub: nsecToNpubHex(data.nsec),
        });
        // Reproduces the exact VMK createAccountVault sealed under (nsec → VMK
        // is deterministic and cheap), avoiding a repeat of Argon2id.
        const vmk = deriveVaultMasterKeyFromNsec(data.nsec);
        await clearSealedSecret();
        set({
          session: new VaultSession(vmk),
          pendingNsec: data.nsec,
          status: "unlocked",
          pendingVault: null,
        });
        markParentUnlocked();
      } catch (error) {
        // Leave pendingVault intact so the caller can retry saveVaultKeys without
        // re-verifying. needs-setup is accurate: authenticated, vault not yet stored.
        set({ status: "needs-setup" });
        throw error;
      }
    },

    discardLocalVault: async () => {
      set({ pendingVault: null });
      await clearSealedSecret();
    },

    unlockOrBootstrap: async (password) => {
      const keys = await fetchVaultKeys();
      if (!keys) {
        await get().bootstrap(password);
        return { created: true };
      }
      // Reuse the keys we just fetched — no second round trip.
      set({ status: "working", error: null });
      await unlockWithKeys(keys, password);
      return { created: false };
    },

    unlockWithPassword: async (password) => {
      set({ status: "working", error: null });
      try {
        const keys = await fetchVaultKeys();
        if (!keys) {
          set({ status: "needs-setup" });
          throw new Error("No vault to unlock");
        }
        await unlockWithKeys(keys, password);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unlock failed";
        set({ status: "locked", error: message });
        throw error;
      }
    },

    unlockWithNsec: async (nsec) => {
      set({ status: "working", error: null });
      try {
        const keys = await fetchVaultKeys();
        if (!keys) {
          set({ status: "needs-setup" });
          throw new Error("No vault to unlock");
        }
        const vmk = unlockVaultWithNsec(keys, nsec);
        // Background for the same reason as the password path: registration
        // only serves the next visit's silent unlock. The npub rides along as a
        // set-once bind (no-op when already bound; heals pre-npub accounts).
        void ensureDeviceRegistered(keys, vmk, {
          npub: nsecToNpubHex(nsec),
        }).catch(() => {});
        set({ session: new VaultSession(vmk), status: "unlocked" });
        // Strong-auth (password/nsec) ⇒ open the parent area for this session.
        markParentUnlocked();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Recovery failed";
        set({ status: "locked", error: message });
        throw error;
      }
    },

    unlockSilently: async () => {
      if (get().status === "unlocked") return true;
      set({ status: "working", error: null });
      try {
        const device = await loadDevice();
        let keys: StoredVaultKeys | null;
        try {
          keys = await fetchVaultKeys();
          // Write-through (sealed under a non-extractable key) so the next
          // cold start can unlock offline.
          if (keys) void offlineCache.writeVaultKeys(keys);
        } catch (error) {
          // Network failure → sealed offline copy. `needs-setup` stays
          // online-authoritative: only a real server `null` reaches it below.
          keys = await offlineCache.readVaultKeys<StoredVaultKeys>();
          if (!keys) throw error;
          useConnectivityStore.getState().reportOffline();
        }
        if (!keys) {
          set({ status: "needs-setup" });
          return false;
        }
        if (!keys.deviceWraps.some((d) => d.deviceId === device.deviceId)) {
          set({ status: "locked" });
          return false;
        }
        const vmk = unlockVaultWithDevice(
          keys,
          device.deviceId,
          device.kem.secretKey,
        );
        set({ session: new VaultSession(vmk), status: "unlocked" });
        return true;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Silent unlock failed";
        set({ status: "locked", error: message });
        return false;
      }
    },

    resetPasswordWithNsec: async (nsec, newPassword, onVerified) => {
      set({ status: "working", error: null });
      try {
        const keys = await fetchVaultKeys();
        if (!keys) {
          // Account predates the vault — nothing to re-wrap. Update the auth
          // password; the vault bootstraps on next authenticated entry.
          await onVerified();
          set({ status: "needs-setup" });
          return;
        }
        // Verify the nsec (throws on a wrong-but-valid nsec) BEFORE touching
        // the auth password, so the two never diverge on a typo.
        const vmk = unlockVaultWithNsec(keys, nsec);
        await onVerified();
        const updated = await setVaultPassword(keys, vmk, newPassword);
        // Set-once npub bind rides along: a no-op on a bound account, and it
        // self-heals accounts whose bootstrap predates the npub column.
        await saveVaultKeys(updated, { npub: nsecToNpubHex(nsec) });
        await ensureDeviceRegistered(updated, vmk);
        set({ session: new VaultSession(vmk), status: "unlocked" });
        markParentUnlocked();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Password reset failed";
        set({ status: "locked", error: message });
        throw error;
      }
    },

    changePassword: async (newPassword) => {
      const session = get().session;
      if (!session) throw new Error("Vault is locked");
      const keys = await fetchVaultKeys();
      if (!keys) throw new Error("No vault to update");
      await saveVaultKeys({
        ...keys,
        passwordWrap: await session.rewrapPassword(newPassword),
      });
    },

    addDevice: async (device) => {
      const session = get().session;
      if (!session) throw new Error("Vault is locked");
      const keys = await fetchVaultKeys();
      if (!keys) throw new Error("No vault to update");
      await saveVaultKeys(session.addDevice(keys, device));
    },

    removeDevice: async (deviceId) => {
      const keys = await fetchVaultKeys();
      if (!keys) throw new Error("No vault to update");
      await saveVaultKeys(removeDeviceFromVault(keys, deviceId));
    },

    acknowledgeNsec: () => set({ pendingNsec: null }),

    lock: () => {
      get().session?.lock();
      set({ session: null, status: "locked" });
      clearParentUnlocked();
    },
  };
});
