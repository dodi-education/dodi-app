/**
 * Client vault orchestration. Holds the in-memory `VaultSession` for the app
 * and coordinates device keys, the wrapped-key endpoint, and the crypto layer.
 *
 * Flow:
 *  - register  → bootstrap(password): create vault, store wraps, show nsec
 *  - login     → unlockOrBootstrap(password)
 *  - app load  → unlockSilently(): device key unwraps the VMK with no prompt
 *  - new device→ unlockWithPassword / unlockWithNsec (then self-registers)
 *
 * The owner unlocks the family's own blob (accounts.vault_keys). Any other
 * family member unlocks their personal key the same way (password, device)
 * and opens the family's key wrapped to it (see @dodi/vault member-keys); the
 * platform tells them apart (`MemberVaultError`). Members never write the
 * family's blob: their device and password wraps go to their personal key.
 *
 * Argon2id runs wherever the client routed it (`setArgon2idExecutor`): a Web
 * Worker in the browser, a native module on mobile.
 */
import { createStore, type StoreApi } from "zustand/vanilla";

import {
  type KemWrappedKey,
  deriveVaultMasterKeyFromNsec,
  nsecToNpubHex,
  toBase64Url,
} from "@dodi/crypto";
import { MemberVaultError, NoFamilyError } from "@dodi/protocol/client";
import {
  type DeviceKeystore,
  type DeviceRegistration,
  type StoredDevice,
  type StoredVaultKeys,
  VaultSession,
  addDeviceToVault,
  createAccountVault,
  getOrCreateDevice,
  openMemberVaultKey,
  removeDeviceFromVault,
  setVaultPassword,
  unlockVaultWithDevice,
  unlockVaultWithNsec,
  unlockVaultWithPassword,
} from "@dodi/vault";

import type { ConnectivityStore } from "./connectivity-store";
import {
  type MemberUnlockKeys,
  appendFamilyDeviceWrap,
  fetchMemberUnlockKeys,
  fetchUserKeys,
  putUserVaultKeys,
  removeFamilyDeviceWrap,
} from "./member-vault";
import type { OfflineCache, ParentLock, PlatformApi, SealedSecretSlot } from "./platform";

/** `no-family`: signed in, but the login belongs to no family (nothing to unlock). */
export type VaultStatus = "idle" | "working" | "unlocked" | "locked" | "needs-setup" | "no-family";

/**
 * Whose keys opened the vault: `account` = the family's own (the owner),
 * `member` = the person's personal key (every other family member).
 */
export type VaultKind = "account" | "member";

/** A member whose family has not handed them its key (or whose keys are gone). */
export const MEMBER_KEYS_MISSING = "member-keys-missing";

export interface VaultState {
  status: VaultStatus;
  session: VaultSession | null;
  /** Set once unlocked (null before): members have no recovery key of their own. */
  kind: VaultKind | null;
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
  createLocalVault: (email: string, password: string, importedNsec?: string) => Promise<void>;
  /**
   * After the OTP code establishes a session: persist the sealed vault, activate
   * the session, and reveal the nsec account key. Retry-safe on a failed save.
   */
  finalizeVault: () => Promise<void>;
  /** Drop the pending local vault + sealed blob (e.g. "use a different email"). */
  discardLocalVault: () => Promise<void>;
  /**
   * Sign-in path. Unlocks the stored vault, or — when the account has none yet —
   * adopts the vault sealed at registration for this same email before falling
   * back to generating a fresh one. Adoption is what preserves an imported nsec
   * when the emailed code was only entered on a later attempt.
   */
  unlockOrBootstrap: (password: string, email?: string) => Promise<{ created: boolean }>;
  unlockWithPassword: (password: string) => Promise<void>;
  unlockWithNsec: (nsec: string) => Promise<void>;
  unlockSilently: () => Promise<boolean>;
  /**
   * Cold forgot-password reset: verify the nsec account key, re-wrap the vault
   * under the new password, and unlock this device. `onVerified` runs AFTER the
   * nsec checks out but BEFORE the vault is re-wrapped — the caller uses it to
   * update the auth password, so a wrong nsec never mutates auth and
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
  /**
   * A member's forgotten password: from a device that still opens their
   * personal key, verify it, run `onVerified` (the auth password update), and
   * re-wrap the personal key under the new password. Throws
   * `MEMBER_KEYS_MISSING` when this device cannot open it (the family must
   * invite them again).
   */
  resetMemberPassword: (newPassword: string, onVerified: () => Promise<void>) => Promise<void>;
  /**
   * After joining a family: start the session with the family's key and keep
   * the personal key it was wrapped to (both just opened by the join flow).
   */
  adoptMemberVault: (vmk: Uint8Array, seed: Uint8Array) => void;
  acknowledgeNsec: () => void;
  lock: () => void;
}

function deviceRegistration(device: StoredDevice) {
  return {
    deviceId: device.deviceId,
    deviceKemPublicKey: toBase64Url(device.kem.publicKey),
  };
}

export interface VaultStoreDeps {
  api: PlatformApi;
  deviceKeystore: DeviceKeystore;
  offlineCache: OfflineCache;
  registrationSeal: SealedSecretSlot;
  parentLock: ParentLock;
  connectivity: ConnectivityStore;
}

export type VaultStore = StoreApi<VaultState>;

/**
 * What this person unlocks with. `keys` wraps the root: the family's VMK for
 * the owner, the personal key for a member (whose VMK is then opened from
 * `memberWrap`).
 */
type Keyring =
  | { kind: "account"; keys: StoredVaultKeys }
  | {
      kind: "member";
      keys: StoredVaultKeys;
      memberWrap: KemWrappedKey;
      familyVmkCheck: string | null;
    };

function memberKeyring(unlock: MemberUnlockKeys): Keyring {
  if (!unlock.userKeys || !unlock.memberWrap) throw new Error(MEMBER_KEYS_MISSING);
  return {
    kind: "member",
    keys: unlock.userKeys.vaultKeys,
    memberWrap: unlock.memberWrap,
    familyVmkCheck: unlock.familyVmkCheck,
  };
}

/** The offline copy: the family's blob (owners, and older copies) or a member's unlock keys. */
function keyringFromCache(cached: unknown): Keyring | null {
  if (!cached || typeof cached !== "object") return null;
  if ((cached as { kind?: unknown }).kind === "member") {
    return memberKeyring(cached as MemberUnlockKeys);
  }
  return { kind: "account", keys: cached as StoredVaultKeys };
}

export function createVaultStore(deps: VaultStoreDeps): VaultStore {
  const { api, offlineCache, registrationSeal, parentLock, connectivity } = deps;
  const loadDevice = (): Promise<StoredDevice> => getOrCreateDevice(deps.deviceKeystore);
  const fetchVaultKeys = (): Promise<StoredVaultKeys | null> => api.getVaultKeys();
  const saveVaultKeys = (keys: StoredVaultKeys, opts?: { npub?: string }): Promise<void> =>
    api.putVaultKeys(keys, opts);

  /** In memory while a member's vault is open: their personal key (for password and device wraps). */
  let memberSeed: Uint8Array | null = null;
  const dropMemberSeed = (): void => {
    memberSeed?.fill(0);
    memberSeed = null;
  };

  /**
   * The person's keyring. Null: the owner has no vault yet (bootstrap). A
   * member's unlock keys come along with the offline write-through copy.
   */
  const fetchKeyring = async (options: { cacheOffline?: boolean } = {}): Promise<Keyring | null> => {
    try {
      const keys = await fetchVaultKeys();
      if (keys && options.cacheOffline) void offlineCache.writeVaultKeys(keys);
      return keys ? { kind: "account", keys } : null;
    } catch (error) {
      if (!(error instanceof MemberVaultError)) throw error;
      const unlock = await fetchMemberUnlockKeys(api);
      if (options.cacheOffline) void offlineCache.writeVaultKeys(unlock);
      return memberKeyring(unlock);
    }
  };

  /** Persist new wraps of the keyring's root where they belong. */
  const saveKeyring = (ring: Keyring, keys: StoredVaultKeys, opts?: { npub?: string }): Promise<void> =>
    ring.kind === "account" ? saveVaultKeys(keys, opts) : putUserVaultKeys(api, keys);

  /** The family's VMK from the keyring's root. */
  const vmkFromRoot = (ring: Keyring, root: Uint8Array): Uint8Array =>
    ring.kind === "account"
      ? root
      : openMemberVaultKey(root, ring.memberWrap, ring.familyVmkCheck ?? undefined);

  /** Authorize this device against the keyring if it isn't already (so next load unlocks silently). */
  const ensureDeviceRegistered = async (
    ring: Keyring,
    root: Uint8Array,
    opts?: { npub?: string },
  ): Promise<void> => {
    const device = await loadDevice();
    if (ring.keys.deviceWraps.some((d) => d.deviceId === device.deviceId)) return;
    await saveKeyring(ring, addDeviceToVault(ring.keys, root, deviceRegistration(device)), opts);
  };

  return createStore<VaultState>()((set, get) => {
    /** Open the session from a keyring's root (owner: the VMK itself). */
    const openSession = (ring: Keyring, root: Uint8Array): void => {
      const vmk = vmkFromRoot(ring, root);
      dropMemberSeed();
      if (ring.kind === "member") memberSeed = root;
      set({ session: new VaultSession(vmk), status: "unlocked", kind: ring.kind });
    };

    /**
     * Shared password-unlock tail (login + unlock prompt): unwrap the root and
     * activate the session. Device registration only matters for the NEXT
     * visit's silent unlock, so it runs in the background instead of gating the
     * login on its extra round trip — if it fails, the next load just asks for
     * the password again.
     */
    const unlockWithKeys = async (ring: Keyring, password: string): Promise<void> => {
      try {
        const root = await unlockVaultWithPassword(ring.keys, password);
        openSession(ring, root);
        void ensureDeviceRegistered(ring, root).catch(() => {});
        // Strong-auth (password/phrase) ⇒ open the parent area for this session.
        parentLock.markUnlocked();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unlock failed";
        set({ status: "locked", error: message });
        throw error;
      }
    };

    /**
     * After an owner's password change: the login's personal key (it joined
     * another family) follows along when this device can open it; otherwise
     * it keeps the old password until it is opened next.
     */
    const rewrapOwnUserKeys = async (newPassword: string): Promise<void> => {
      const userKeys = await fetchUserKeys(api);
      if (!userKeys) return;
      const device = await loadDevice();
      if (!userKeys.vaultKeys.deviceWraps.some((d) => d.deviceId === device.deviceId)) return;
      const seed = unlockVaultWithDevice(userKeys.vaultKeys, device.deviceId, device.kem.secretKey);
      try {
        await putUserVaultKeys(api, await setVaultPassword(userKeys.vaultKeys, seed, newPassword));
      } finally {
        seed.fill(0);
      }
    };

    return {
      status: "idle",
      session: null,
      kind: null,
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
          dropMemberSeed();
          set({
            session: new VaultSession(vmk),
            pendingNsec: nsec,
            status: "unlocked",
            kind: "account",
          });
          parentLock.markUnlocked();
        } catch (error) {
          const message = error instanceof Error ? error.message : "Vault setup failed";
          set({ status: "needs-setup", error: message });
          throw error;
        }
      },

      createLocalVault: async (email, password, importedNsec) => {
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
        // The email binds the seal to its account: a later sign-in only adopts
        // it for that same address, never for whoever signs in next.
        await registrationSeal.stash(JSON.stringify({ storedKeys, nsec, email }));
      },

      finalizeVault: async () => {
        set({ status: "working", error: null });
        try {
          // Prefer the in-memory copy (set below on the first attempt) so a retry
          // after a failed save doesn't depend on the already-wiped seal.
          let data = get().pendingVault;
          if (!data) {
            const raw = await registrationSeal.consume();
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
          await registrationSeal.clear();
          dropMemberSeed();
          set({
            session: new VaultSession(vmk),
            pendingNsec: data.nsec,
            status: "unlocked",
            kind: "account",
            pendingVault: null,
          });
          parentLock.markUnlocked();
        } catch (error) {
          // Leave pendingVault intact so the caller can retry saveVaultKeys without
          // re-verifying. needs-setup is accurate: authenticated, vault not yet stored.
          set({ status: "needs-setup" });
          throw error;
        }
      },

      discardLocalVault: async () => {
        set({ pendingVault: null });
        await registrationSeal.clear();
      },

      unlockOrBootstrap: async (password, email) => {
        let ring: Keyring | null;
        try {
          ring = await fetchKeyring();
        } catch (error) {
          if (error instanceof NoFamilyError) set({ status: "no-family", error: null });
          throw error;
        }
        if (!ring) {
          // No vault stored yet. Registration may have sealed one on this device
          // (with an imported nsec) that never got persisted because the code was
          // entered later. Consume the seal either way so it cannot linger.
          const raw = await registrationSeal.consume();
          if (raw) {
            try {
              const pending = JSON.parse(raw) as {
                storedKeys: StoredVaultKeys;
                nsec: string;
                email?: string;
              };
              if (email && pending.email === email) {
                set({
                  pendingVault: {
                    storedKeys: pending.storedKeys,
                    nsec: pending.nsec,
                  },
                });
                await get().finalizeVault();
                return { created: true };
              }
            } catch {
              // Unreadable seal: fall through and bootstrap a fresh vault.
            }
          }
          await get().bootstrap(password);
          return { created: true };
        }
        // Reuse the keys we just fetched — no second round trip.
        set({ status: "working", error: null });
        await unlockWithKeys(ring, password);
        return { created: false };
      },

      unlockWithPassword: async (password) => {
        set({ status: "working", error: null });
        try {
          const ring = await fetchKeyring();
          if (!ring) {
            set({ status: "needs-setup" });
            throw new Error("No vault to unlock");
          }
          await unlockWithKeys(ring, password);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unlock failed";
          set({ status: "locked", error: message });
          throw error;
        }
      },

      unlockWithNsec: async (nsec) => {
        set({ status: "working", error: null });
        try {
          const ring = await fetchKeyring();
          if (!ring) {
            set({ status: "needs-setup" });
            throw new Error("No vault to unlock");
          }
          if (ring.kind === "member") {
            throw new Error("The recovery key belongs to the family's owner");
          }
          const vmk = unlockVaultWithNsec(ring.keys, nsec);
          // Background for the same reason as the password path: registration
          // only serves the next visit's silent unlock. The npub rides along as a
          // set-once bind (no-op when already bound; heals pre-npub accounts).
          void ensureDeviceRegistered(ring, vmk, {
            npub: nsecToNpubHex(nsec),
          }).catch(() => {});
          openSession(ring, vmk);
          // Strong-auth (password/nsec) ⇒ open the parent area for this session.
          parentLock.markUnlocked();
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
          let ring: Keyring | null;
          try {
            // Write-through (sealed at rest by the platform's offline cache) so
            // the next cold start can unlock offline.
            ring = await fetchKeyring({ cacheOffline: true });
          } catch (error) {
            if (error instanceof NoFamilyError) {
              set({ status: "no-family", error: null });
              return false;
            }
            if (error instanceof Error && error.message === MEMBER_KEYS_MISSING) throw error;
            // Network failure → sealed offline copy. `needs-setup` stays
            // online-authoritative: only a real server `null` reaches it below.
            ring = keyringFromCache(await offlineCache.readVaultKeys<unknown>());
            if (!ring) throw error;
            connectivity.getState().reportOffline();
          }
          if (!ring) {
            set({ status: "needs-setup" });
            return false;
          }
          if (!ring.keys.deviceWraps.some((d) => d.deviceId === device.deviceId)) {
            set({ status: "locked", kind: ring.kind });
            return false;
          }
          const root = unlockVaultWithDevice(ring.keys, device.deviceId, device.kem.secretKey);
          openSession(ring, root);
          return true;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Silent unlock failed";
          set({ status: "locked", error: message });
          return false;
        }
      },

      resetPasswordWithNsec: async (nsec, newPassword, onVerified) => {
        set({ status: "working", error: null });
        try {
          const keys = await fetchVaultKeys();
          // (A member never gets here: their GET answers MemberVaultError.)
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
          const ring: Keyring = { kind: "account", keys: updated };
          await ensureDeviceRegistered(ring, vmk);
          openSession(ring, vmk);
          parentLock.markUnlocked();
        } catch (error) {
          const message = error instanceof Error ? error.message : "Password reset failed";
          set({ status: "locked", error: message });
          throw error;
        }
      },

      changePassword: async (newPassword) => {
        const session = get().session;
        if (!session) throw new Error("Vault is locked");
        const ring = await fetchKeyring();
        if (!ring) throw new Error("No vault to update");
        if (ring.kind === "member") {
          if (!memberSeed) throw new Error("Vault is locked");
          await putUserVaultKeys(api, await setVaultPassword(ring.keys, memberSeed, newPassword));
          return;
        }
        await saveVaultKeys({
          ...ring.keys,
          passwordWrap: await session.rewrapPassword(newPassword),
        });
        await rewrapOwnUserKeys(newPassword).catch(() => {});
      },

      addDevice: async (device) => {
        const session = get().session;
        if (!session) throw new Error("Vault is locked");
        if (get().kind === "member") {
          // Never rewrite the owner's blob: add just this device's wrap.
          await appendFamilyDeviceWrap(api, {
            ...device,
            wrapped: session.wrapForMember(device.deviceKemPublicKey),
          });
          return;
        }
        const keys = await fetchVaultKeys();
        if (!keys) throw new Error("No vault to update");
        await saveVaultKeys(session.addDevice(keys, device));
      },

      removeDevice: async (deviceId) => {
        if (get().kind === "member") {
          await removeFamilyDeviceWrap(api, deviceId);
          return;
        }
        const keys = await fetchVaultKeys();
        if (!keys) throw new Error("No vault to update");
        await saveVaultKeys(removeDeviceFromVault(keys, deviceId));
      },

      resetMemberPassword: async (newPassword, onVerified) => {
        // Not a member, or this device can't open their key: nothing changes
        // here (the caller resets the sign-in password alone).
        let ring: Keyring | null;
        try {
          ring = await fetchKeyring();
        } catch {
          throw new Error(MEMBER_KEYS_MISSING);
        }
        if (!ring || ring.kind !== "member") throw new Error(MEMBER_KEYS_MISSING);
        const device = await loadDevice();
        if (!ring.keys.deviceWraps.some((d) => d.deviceId === device.deviceId)) {
          throw new Error(MEMBER_KEYS_MISSING);
        }
        set({ status: "working", error: null });
        try {
          const seed = unlockVaultWithDevice(ring.keys, device.deviceId, device.kem.secretKey);
          // Proves this device still opens the family before the password moves.
          vmkFromRoot(ring, seed);
          await onVerified();
          await putUserVaultKeys(api, await setVaultPassword(ring.keys, seed, newPassword));
          openSession(ring, seed);
          parentLock.markUnlocked();
        } catch (error) {
          const message = error instanceof Error ? error.message : "Password reset failed";
          set({ status: "locked", error: message });
          throw error;
        }
      },

      adoptMemberVault: (vmk, seed) => {
        dropMemberSeed();
        memberSeed = seed;
        set({ session: new VaultSession(vmk), status: "unlocked", kind: "member", error: null });
        parentLock.markUnlocked();
      },

      acknowledgeNsec: () => set({ pendingNsec: null }),

      lock: () => {
        get().session?.lock();
        dropMemberSeed();
        set({ session: null, status: "locked" });
        parentLock.clear();
      },
    };
  });
}
