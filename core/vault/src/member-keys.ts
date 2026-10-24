/**
 * Keys of family members other than the owner.
 *
 * The owner opens the family's vault master key (VMK) from the family's own
 * `StoredVaultKeys` blob. Another member never touches that blob; they open
 * the VMK in two steps:
 *
 *   1. their personal key: a random 32-byte seed, wrapped by their own
 *      password and their own devices in a `StoredVaultKeys` blob of its own
 *      (same wraps, same unlock functions; `vmkCheck` is sealed under the seed)
 *   2. the family's VMK, wrapped (ML-KEM) to the KEM key derived from that seed
 *      (`account_members.member_vmk_wrap`)
 *
 * One personal key serves every family a login belongs to: joining another
 * family is one more wrap, and a password change re-wraps one seed.
 *
 * Invitations hand the VMK over without both people being online: the
 * inviter seals it under a random link secret, the invitee opens it with the
 * secret from the link and re-wraps it to their personal key. The secret only
 * travels in the link's #fragment, never to the server.
 *
 * Pure functions, no I/O.
 */
import {
  type Argon2Params,
  type KemWrappedKey,
  DEVICE_SEED_LENGTH,
  decryptField,
  deriveDeviceKeyPairsFromSeed,
  deriveKey,
  encryptField,
  fromBase64Url,
  open,
  randomBytes,
  seal,
  toBase64Url,
  unwrapKeyWithDevice,
  wrapKeyForDevice,
  wrapKeyWithPassword,
} from "@dodi/crypto";

import { type DeviceRegistration, isVaultMasterKeyFor } from "./account-keys";
import type { StoredVaultKeys } from "./types";

/** Sealed under the personal seed so an unlock can verify it. */
const USER_KEY_CHECK_PLAINTEXT = "dodi/user-key-check/v1";

/** HKDF info for the key an invitation link's secret derives. */
const INVITE_KEY_INFO = "dodi/family-invite/v1";

/** A login's personal key as stored server-side (`user_keys`). */
export interface StoredUserKeys {
  /** base64url ML-KEM-768 public key derived from the seed: families wrap their VMK to it. */
  kemPublicKey: string;
  /** base64url ML-DSA-65 public key derived from the seed. */
  signPublicKey: string;
  /** The seed, wrapped by the login's password and devices. */
  vaultKeys: StoredVaultKeys;
}

export interface CreatedUserKeys {
  /** In memory only: the personal key. */
  seed: Uint8Array;
  userKeys: StoredUserKeys;
}

/** Public keys a seed derives. */
export function userPublicKeys(seed: Uint8Array): { kemPublicKey: string; signPublicKey: string } {
  const pairs = deriveDeviceKeyPairsFromSeed(seed);
  return {
    kemPublicKey: toBase64Url(pairs.kem.publicKey),
    signPublicKey: toBase64Url(pairs.sign.publicKey),
  };
}

/** A new personal key, wrapped by the login's password and this device. */
export async function createUserKeys(params: {
  password: string;
  device: DeviceRegistration;
  argon2Params?: Argon2Params;
}): Promise<CreatedUserKeys> {
  const seed = randomBytes(DEVICE_SEED_LENGTH);
  const vaultKeys: StoredVaultKeys = {
    passwordWrap: await wrapKeyWithPassword(params.password, seed, params.argon2Params),
    deviceWraps: [
      {
        deviceId: params.device.deviceId,
        deviceKemPublicKey: params.device.deviceKemPublicKey,
        wrapped: wrapKeyForDevice(fromBase64Url(params.device.deviceKemPublicKey), seed),
      },
    ],
    vmkCheck: encryptField(seed, USER_KEY_CHECK_PLAINTEXT),
  };
  return { seed, userKeys: { ...userPublicKeys(seed), vaultKeys } };
}

/** Whether `seed` is the personal key these stored keys belong to. */
export function isUserKeyFor(userKeys: StoredUserKeys, seed: Uint8Array): boolean {
  try {
    return (
      decryptField(seed, userKeys.vaultKeys.vmkCheck) === USER_KEY_CHECK_PLAINTEXT &&
      userPublicKeys(seed).kemPublicKey === userKeys.kemPublicKey
    );
  } catch {
    return false;
  }
}

/** Wrap a family's VMK to a member's personal KEM key. */
export function wrapVaultKeyForMember(
  vmk: Uint8Array,
  memberKemPublicKey: string,
): KemWrappedKey {
  return wrapKeyForDevice(fromBase64Url(memberKemPublicKey), vmk);
}

/**
 * Open a family's VMK with the member's personal key, and check it against
 * the family's `vmkCheck` when given (a wrong or swapped wrap fails here
 * instead of producing undecryptable data later).
 */
export function openMemberVaultKey(
  seed: Uint8Array,
  memberWrap: KemWrappedKey,
  familyVmkCheck?: string,
): Uint8Array {
  const { kem } = deriveDeviceKeyPairsFromSeed(seed);
  const vmk = unwrapKeyWithDevice(kem.secretKey, memberWrap);
  if (familyVmkCheck !== undefined && !isVaultMasterKeyFor(familyVmkCheck, vmk)) {
    throw new Error("This family's key does not match");
  }
  return vmk;
}

/** The VMK sealed for an invitation (stored server-side, opaque). */
interface SealedInvite {
  v: 1;
  scheme: "invite";
  nonce: string;
  ciphertext: string;
}

export interface CreatedInvite {
  /** base64url secret for the link's #fragment. Never sent to the server. */
  secret: string;
  /** JSON of the sealed VMK, stored with the invitation. */
  sealed: string;
}

/** Seal a family's VMK under a fresh link secret. */
export function createInviteWrap(vmk: Uint8Array): CreatedInvite {
  const secret = randomBytes(32);
  const box = seal(deriveKey(secret, INVITE_KEY_INFO), vmk);
  const sealed: SealedInvite = {
    v: 1,
    scheme: "invite",
    nonce: toBase64Url(box.nonce),
    ciphertext: toBase64Url(box.ciphertext),
  };
  return { secret: toBase64Url(secret), sealed: JSON.stringify(sealed) };
}

/**
 * Open an invitation with the secret from its link, verified against the
 * family's `vmkCheck`. Throws when the secret is wrong or anything was changed.
 */
export function openInviteWrap(secret: string, sealed: string, familyVmkCheck: string): Uint8Array {
  let vmk: Uint8Array;
  try {
    const box = JSON.parse(sealed) as SealedInvite;
    vmk = open(deriveKey(fromBase64Url(secret), INVITE_KEY_INFO), {
      nonce: fromBase64Url(box.nonce),
      ciphertext: fromBase64Url(box.ciphertext),
    });
  } catch {
    throw new Error("This invitation link is incomplete");
  }
  if (!isVaultMasterKeyFor(familyVmkCheck, vmk)) {
    throw new Error("This invitation link is incomplete");
  }
  return vmk;
}
