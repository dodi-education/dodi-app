/**
 * Friend cards — the E2EE mechanism that lets one kid reveal their name (and,
 * once accepted, birthdate) to another kid without the server ever reading it.
 *
 * Each profile has its own ML-KEM-768 + ML-DSA-65 identity (separate from device
 * keys, so any device the kid signs into can use it). The public halves are
 * published plaintext on the profile row; the secret halves are sealed under the
 * account Vault Master Key (`friend_secret_keys`). A card is sealed to the
 * recipient profile's KEM public key and signed with the sender profile's
 * signing key — this is exactly the message envelope (`./envelope`), reused with
 * profile keys instead of device keys. The server stores the opaque blob and
 * only gates *delivery* by friendship status; it can never decrypt it.
 */
import {
  type KemKeyPair,
  type SignKeyPair,
  fromBase64Url,
  generateKemKeyPair,
  generateSignKeyPair,
  toBase64Url,
} from "@dodi/crypto";
import type { FriendCard, FriendPreviewCard } from "@dodi/types/database";
import { VaultSession } from "@dodi/vault";

import {
  type SealedEnvelope,
  openEnvelopeJson,
  sealEnvelopeJson,
} from "./envelope";

/** A profile's friend identity: KEM keypair (receive) + signing keypair (send). */
export interface ProfileFriendKeys {
  kem: KemKeyPair;
  sign: SignKeyPair;
}

/** The plaintext public halves, base64url, as published on the profile row. */
export interface PublishedFriendKeys {
  kemPublicKey: string;
  signPublicKey: string;
}

/** Wire shape of the sealed secret-key bundle (all base64url). */
interface SecretKeyBundle {
  kem: { publicKey: string; secretKey: string };
  sign: { publicKey: string; secretKey: string };
}

/** Generate a fresh per-profile friend identity. */
export function generateProfileFriendKeys(): ProfileFriendKeys {
  return { kem: generateKemKeyPair(), sign: generateSignKeyPair() };
}

/** The public halves to publish plaintext on the profile (for others to seal to). */
export function publishedFriendKeys(keys: ProfileFriendKeys): PublishedFriendKeys {
  return {
    kemPublicKey: toBase64Url(keys.kem.publicKey),
    signPublicKey: toBase64Url(keys.sign.publicKey),
  };
}

/** Seal the full keypair under the account VMK for storage in `friend_secret_keys`. */
export function wrapProfileSecretKeys(
  session: VaultSession,
  keys: ProfileFriendKeys,
): string {
  const bundle: SecretKeyBundle = {
    kem: {
      publicKey: toBase64Url(keys.kem.publicKey),
      secretKey: toBase64Url(keys.kem.secretKey),
    },
    sign: {
      publicKey: toBase64Url(keys.sign.publicKey),
      secretKey: toBase64Url(keys.sign.secretKey),
    },
  };
  return session.encryptJson(bundle);
}

/** Recover the keypair from a sealed `friend_secret_keys` blob. */
export function unwrapProfileSecretKeys(
  session: VaultSession,
  blob: string,
): ProfileFriendKeys {
  const bundle = session.decryptJson<SecretKeyBundle>(blob);
  if (!bundle) throw new Error("friend secret keys are missing or empty");
  return {
    kem: {
      publicKey: fromBase64Url(bundle.kem.publicKey),
      secretKey: fromBase64Url(bundle.kem.secretKey),
    },
    sign: {
      publicKey: fromBase64Url(bundle.sign.publicKey),
      secretKey: fromBase64Url(bundle.sign.secretKey),
    },
  };
}

/**
 * Seal a friend card (preview or full) to a recipient profile's KEM public key,
 * signed by the sender profile. `recipientKemPublicKey` is the base64url value
 * from a friend lookup.
 */
export function sealFriendCard(
  recipientKemPublicKey: string,
  card: FriendCard | FriendPreviewCard,
  sender: SignKeyPair,
): SealedEnvelope {
  return sealEnvelopeJson(fromBase64Url(recipientKemPublicKey), card, {
    signPublicKey: sender.publicKey,
    signSecretKey: sender.secretKey,
  });
}

/**
 * Open a friend card with the recipient profile's KEM secret key. Pass the
 * expected sender signing public key (base64url, from the friendship row's known
 * counterpart) to bind the card to that profile and reject a swapped sender.
 */
export function openFriendCard<T extends FriendPreviewCard = FriendCard>(
  recipientKemSecretKey: Uint8Array,
  envelope: SealedEnvelope,
  expectedSenderSignPublicKey?: string,
): T {
  return openEnvelopeJson<T>(
    recipientKemSecretKey,
    envelope,
    expectedSenderSignPublicKey
      ? {
          expectedSenderSignPublicKey: fromBase64Url(
            expectedSenderSignPublicKey,
          ),
        }
      : undefined,
  );
}
