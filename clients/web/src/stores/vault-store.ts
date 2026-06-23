/**
 * Client vault orchestration. Holds the in-memory `VaultSession` for the tab and
 * coordinates device keys, the wrapped-key endpoint, and the crypto layer.
 *
 * Flow:
 *  - register  → bootstrap(password): create vault, store wraps, show phrase
 *  - login     → unlockOrBootstrap(password)
 *  - app load  → unlockSilently(): device key unwraps the VMK with no prompt
 *  - new device→ unlockWithPassword / unlockWithPhrase (then self-registers)
 */
import { create } from "zustand";

import { toBase64Url } from "@dodi/crypto";
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
  unlockVaultWithPassword,
  unlockVaultWithPhrase,
} from "@dodi/vault";
import { fetchVaultKeys, saveVaultKeys } from "@/lib/vault-client";

export type VaultStatus =
  | "idle"
  | "working"
  | "unlocked"
  | "locked"
  | "needs-setup";

interface VaultStoreState {
  status: VaultStatus;
  session: VaultSession | null;
  /** Set after bootstrap; shown once on the backup-phrase screen, then cleared. */
  pendingBackupPhrase: string | null;
  error: string | null;

  bootstrap: (password: string) => Promise<string>;
  unlockOrBootstrap: (password: string) => Promise<{ created: boolean }>;
  unlockWithPassword: (password: string) => Promise<void>;
  unlockWithPhrase: (phrase: string) => Promise<void>;
  unlockSilently: () => Promise<boolean>;
  /**
   * Cold forgot-password reset: verify the recovery phrase, re-wrap the vault
   * under the new password, and unlock this device. `onVerified` runs AFTER the
   * phrase checks out but BEFORE the vault is re-wrapped — the caller uses it to
   * update the Supabase auth password, so a wrong phrase never mutates auth and
   * the two stay in sync.
   */
  resetPasswordWithPhrase: (
    phrase: string,
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
  acknowledgeBackupPhrase: () => void;
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
): Promise<void> {
  const device = await loadDevice();
  if (keys.deviceWraps.some((d) => d.deviceId === device.deviceId)) return;
  await saveVaultKeys(addDeviceToVault(keys, vmk, deviceRegistration(device)));
}

export const useVaultStore = create<VaultStoreState>((set, get) => ({
  status: "idle",
  session: null,
  pendingBackupPhrase: null,
  error: null,

  bootstrap: async (password) => {
    set({ status: "working", error: null });
    try {
      const device = await loadDevice();
      const { backupPhrase, vmk, storedKeys } = createAccountVault({
        password,
        device: deviceRegistration(device),
      });
      await saveVaultKeys(storedKeys);
      set({
        session: new VaultSession(vmk),
        pendingBackupPhrase: backupPhrase,
        status: "unlocked",
      });
      return backupPhrase;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Vault setup failed";
      set({ status: "needs-setup", error: message });
      throw error;
    }
  },

  unlockOrBootstrap: async (password) => {
    const keys = await fetchVaultKeys();
    if (!keys) {
      await get().bootstrap(password);
      return { created: true };
    }
    await get().unlockWithPassword(password);
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
      const vmk = unlockVaultWithPassword(keys, password);
      await ensureDeviceRegistered(keys, vmk);
      set({ session: new VaultSession(vmk), status: "unlocked" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unlock failed";
      set({ status: "locked", error: message });
      throw error;
    }
  },

  unlockWithPhrase: async (phrase) => {
    set({ status: "working", error: null });
    try {
      const keys = await fetchVaultKeys();
      if (!keys) {
        set({ status: "needs-setup" });
        throw new Error("No vault to unlock");
      }
      const vmk = unlockVaultWithPhrase(keys, phrase);
      await ensureDeviceRegistered(keys, vmk);
      set({ session: new VaultSession(vmk), status: "unlocked" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Recovery failed";
      set({ status: "locked", error: message });
      throw error;
    }
  },

  unlockSilently: async () => {
    if (get().status === "unlocked") return true;
    set({ status: "working", error: null });
    try {
      const device = await loadDevice();
      const keys = await fetchVaultKeys();
      if (!keys) {
        set({ status: "needs-setup" });
        return false;
      }
      if (!keys.deviceWraps.some((d) => d.deviceId === device.deviceId)) {
        set({ status: "locked" });
        return false;
      }
      const vmk = unlockVaultWithDevice(keys, device.deviceId, device.kem.secretKey);
      set({ session: new VaultSession(vmk), status: "unlocked" });
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Silent unlock failed";
      set({ status: "locked", error: message });
      return false;
    }
  },

  resetPasswordWithPhrase: async (phrase, newPassword, onVerified) => {
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
      // Verify the phrase (throws on a wrong-but-valid phrase) BEFORE touching
      // the auth password, so the two never diverge on a typo.
      const vmk = unlockVaultWithPhrase(keys, phrase);
      await onVerified();
      const updated = setVaultPassword(keys, vmk, newPassword);
      await saveVaultKeys(updated);
      await ensureDeviceRegistered(updated, vmk);
      set({ session: new VaultSession(vmk), status: "unlocked" });
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
      passwordWrap: session.rewrapPassword(newPassword),
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

  acknowledgeBackupPhrase: () => set({ pendingBackupPhrase: null }),

  lock: () => {
    get().session?.lock();
    set({ session: null, status: "locked" });
  },
}));
