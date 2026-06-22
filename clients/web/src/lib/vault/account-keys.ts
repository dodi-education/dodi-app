/**
 * Account vault bootstrap & unlock — ties the P0 crypto wraps to the stored,
 * server-side `StoredVaultKeys` blob.
 *
 * Pure functions (no I/O): the API/store layers fetch and persist
 * `StoredVaultKeys`, while these functions create and operate on it.
 */
import {
  type Argon2Params,
  decryptField,
  deriveVaultMasterKeyFromPhrase,
  encryptField,
  fromBase64Url,
  generateBackupPhrase,
  rewrapKeyWithNewPassword,
  unwrapKeyWithDevice,
  unwrapKeyWithPassword,
  wrapKeyForDevice,
  wrapKeyWithPassword,
} from "@dodi/crypto";

import type { StoredVaultKeys } from "./types";

/** Sealed under the VMK to let phrase recovery verify the derived key. */
const VMK_CHECK_PLAINTEXT = "dodi/vault-check/v1";

export interface DeviceRegistration {
  deviceId: string;
  /** base64url ML-KEM-768 public key of the device. */
  deviceKemPublicKey: string;
}

export interface CreatedVault {
  /** Show ONCE at setup, then discard — the deterministic root. */
  backupPhrase: string;
  /** In-memory key for the session (never persisted in plaintext). */
  vmk: Uint8Array;
  /** Wrapped blobs to persist server-side. */
  storedKeys: StoredVaultKeys;
}

/**
 * Bootstrap a brand-new account vault: generate the backup phrase, derive the
 * VMK, and wrap it for the password + this device.
 */
export function createAccountVault(params: {
  password: string;
  device: DeviceRegistration;
  argon2Params?: Argon2Params;
}): CreatedVault {
  const backupPhrase = generateBackupPhrase();
  const vmk = deriveVaultMasterKeyFromPhrase(backupPhrase);
  const storedKeys: StoredVaultKeys = {
    passwordWrap: wrapKeyWithPassword(params.password, vmk, params.argon2Params),
    deviceWraps: [
      {
        deviceId: params.device.deviceId,
        deviceKemPublicKey: params.device.deviceKemPublicKey,
        wrapped: wrapKeyForDevice(
          fromBase64Url(params.device.deviceKemPublicKey),
          vmk,
        ),
      },
    ],
    vmkCheck: encryptField(vmk, VMK_CHECK_PLAINTEXT),
  };
  return { backupPhrase, vmk, storedKeys };
}

/** Unlock with the account password (new device, or explicit re-auth). */
export function unlockVaultWithPassword(
  storedKeys: StoredVaultKeys,
  password: string,
): Uint8Array {
  if (!storedKeys.passwordWrap) {
    throw new Error("No password is set for this vault");
  }
  return unwrapKeyWithPassword(password, storedKeys.passwordWrap);
}

/** Silent unlock with this device's secret key (e.g. on page reload). */
export function unlockVaultWithDevice(
  storedKeys: StoredVaultKeys,
  deviceId: string,
  deviceSecretKey: Uint8Array,
): Uint8Array {
  const entry = storedKeys.deviceWraps.find((d) => d.deviceId === deviceId);
  if (!entry) {
    throw new Error("This device is not authorized for the vault");
  }
  return unwrapKeyWithDevice(deviceSecretKey, entry.wrapped);
}

/**
 * Recover with the wallet-style backup phrase (forgot password / new device).
 * Verifies the derived VMK against `vmkCheck` so a wrong-but-valid phrase is
 * rejected immediately rather than silently producing an unusable key.
 */
export function unlockVaultWithPhrase(
  storedKeys: StoredVaultKeys,
  phrase: string,
): Uint8Array {
  const vmk = deriveVaultMasterKeyFromPhrase(phrase);
  let matches = false;
  try {
    matches = decryptField(vmk, storedKeys.vmkCheck) === VMK_CHECK_PLAINTEXT;
  } catch {
    matches = false;
  }
  if (!matches) {
    throw new Error("Incorrect backup phrase");
  }
  return vmk;
}

/** Authorize a device by wrapping the VMK to its KEM public key (idempotent per deviceId). */
export function addDeviceToVault(
  storedKeys: StoredVaultKeys,
  vmk: Uint8Array,
  device: DeviceRegistration,
): StoredVaultKeys {
  const deviceWraps = storedKeys.deviceWraps.filter(
    (d) => d.deviceId !== device.deviceId,
  );
  deviceWraps.push({
    deviceId: device.deviceId,
    deviceKemPublicKey: device.deviceKemPublicKey,
    wrapped: wrapKeyForDevice(fromBase64Url(device.deviceKemPublicKey), vmk),
  });
  return { ...storedKeys, deviceWraps };
}

/** Revoke a device's access. */
export function removeDeviceFromVault(
  storedKeys: StoredVaultKeys,
  deviceId: string,
): StoredVaultKeys {
  return {
    ...storedKeys,
    deviceWraps: storedKeys.deviceWraps.filter((d) => d.deviceId !== deviceId),
  };
}

/** Change password while logged in: re-wrap the same VMK under the new password. */
export function changeVaultPassword(
  storedKeys: StoredVaultKeys,
  oldPassword: string,
  newPassword: string,
  argon2Params?: Argon2Params,
): StoredVaultKeys {
  if (!storedKeys.passwordWrap) {
    throw new Error("No password is set for this vault");
  }
  return {
    ...storedKeys,
    passwordWrap: rewrapKeyWithNewPassword(
      oldPassword,
      storedKeys.passwordWrap,
      newPassword,
      argon2Params,
    ),
  };
}

/**
 * Set/replace the password wrap from an already-unwrapped VMK — the
 * device-session reset path. The caller has the VMK in memory (e.g. the vault
 * was silently unlocked via this device's key, or just derived from the phrase),
 * so no old password is required. Only the password wrap rotates; device wraps
 * and the VMK itself are untouched.
 */
export function setVaultPassword(
  storedKeys: StoredVaultKeys,
  vmk: Uint8Array,
  newPassword: string,
  argon2Params?: Argon2Params,
): StoredVaultKeys {
  return {
    ...storedKeys,
    passwordWrap: wrapKeyWithPassword(newPassword, vmk, argon2Params),
  };
}

/**
 * Forgot-password reset: prove ownership via the backup phrase, set a new
 * password. The phrase is verified against `vmkCheck` (via `unlockVaultWithPhrase`)
 * BEFORE re-wrapping, so a wrong-but-valid BIP-39 phrase is rejected rather than
 * silently sealing the new password around a foreign VMK.
 */
export function resetVaultPasswordWithPhrase(
  storedKeys: StoredVaultKeys,
  phrase: string,
  newPassword: string,
  argon2Params?: Argon2Params,
): StoredVaultKeys {
  const vmk = unlockVaultWithPhrase(storedKeys, phrase);
  return setVaultPassword(storedKeys, vmk, newPassword, argon2Params);
}
