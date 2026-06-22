/**
 * E2EE message envelope for the device mailbox (store-and-forward).
 *
 * A client seals a payload to a recipient device's ML-KEM public key and signs
 * it with its own ML-DSA key. The hosted server stores the opaque envelope and
 * can never read the payload — it only routes by the plaintext metadata kept
 * outside the envelope (recipient device id, kind). The recipient device opens
 * it with its ML-KEM secret key after verifying the sender signature.
 *
 * Format is frozen at v:1 — every client (web, agent, future mobile) must agree
 * byte-for-byte, so this is the single source of truth (built on @dodi/crypto).
 */
import {
  type KemWrappedKey,
  bytesToUtf8,
  constantTimeEqual,
  fromBase64Url,
  generateSymmetricKey,
  open,
  seal,
  sign,
  toBase64Url,
  unwrapKeyWithDevice,
  utf8ToBytes,
  verify,
  wrapKeyForDevice,
} from "@dodi/crypto";

export interface SealedEnvelope {
  v: 1;
  /** Per-message symmetric key, KEM-sealed to the recipient device's public key. */
  keyWrap: KemWrappedKey;
  /** base64url — nonce for the payload seal. */
  nonce: string;
  /** base64url — payload sealed with the per-message key. */
  ciphertext: string;
  /** base64url — sender's ML-DSA-65 public key. */
  senderSignPublicKey: string;
  /** base64url — ML-DSA-65 signature over the canonical envelope bytes. */
  signature: string;
}

/** The signing half of a sender's device identity. */
export interface EnvelopeSender {
  signPublicKey: Uint8Array;
  signSecretKey: Uint8Array;
}

export interface OpenEnvelopeOptions {
  /**
   * If provided, the envelope's sender public key must match this exactly. The
   * caller resolves the expected key from the device registry, so a stored but
   * unauthorized sender can't be accepted on signature validity alone.
   */
  expectedSenderSignPublicKey?: Uint8Array;
}

/** Fixed-order serialization of the fields the signature covers. */
function canonicalBytes(
  keyWrap: KemWrappedKey,
  nonce: string,
  ciphertext: string,
): Uint8Array {
  return utf8ToBytes(
    [
      "dodi-envelope/v1",
      keyWrap.kemCiphertext,
      keyWrap.nonce,
      keyWrap.ciphertext,
      nonce,
      ciphertext,
    ].join("\n"),
  );
}

/** Seal raw bytes to a recipient device's ML-KEM public key, signed by the sender. */
export function sealEnvelope(
  recipientKemPublicKey: Uint8Array,
  payload: Uint8Array,
  sender: EnvelopeSender,
): SealedEnvelope {
  const messageKey = generateSymmetricKey();
  const sealed = seal(messageKey, payload);
  const keyWrap = wrapKeyForDevice(recipientKemPublicKey, messageKey);
  const nonce = toBase64Url(sealed.nonce);
  const ciphertext = toBase64Url(sealed.ciphertext);
  const signature = sign(
    sender.signSecretKey,
    canonicalBytes(keyWrap, nonce, ciphertext),
  );
  return {
    v: 1,
    keyWrap,
    nonce,
    ciphertext,
    senderSignPublicKey: toBase64Url(sender.signPublicKey),
    signature: toBase64Url(signature),
  };
}

/** Verify the sender signature, then unseal with the recipient device's secret key. */
export function openEnvelope(
  recipientKemSecretKey: Uint8Array,
  envelope: SealedEnvelope,
  options: OpenEnvelopeOptions = {},
): Uint8Array {
  const senderPublicKey = fromBase64Url(envelope.senderSignPublicKey);
  if (
    options.expectedSenderSignPublicKey &&
    !constantTimeEqual(senderPublicKey, options.expectedSenderSignPublicKey)
  ) {
    throw new Error("envelope sender public key does not match expected sender");
  }
  const signatureValid = verify(
    senderPublicKey,
    canonicalBytes(envelope.keyWrap, envelope.nonce, envelope.ciphertext),
    fromBase64Url(envelope.signature),
  );
  if (!signatureValid) {
    throw new Error("envelope signature verification failed");
  }
  const messageKey = unwrapKeyWithDevice(recipientKemSecretKey, envelope.keyWrap);
  return open(messageKey, {
    nonce: fromBase64Url(envelope.nonce),
    ciphertext: fromBase64Url(envelope.ciphertext),
  });
}

/** Convenience: seal a JSON-serializable value. */
export function sealEnvelopeJson(
  recipientKemPublicKey: Uint8Array,
  value: unknown,
  sender: EnvelopeSender,
): SealedEnvelope {
  return sealEnvelope(
    recipientKemPublicKey,
    utf8ToBytes(JSON.stringify(value)),
    sender,
  );
}

/** Convenience: open and JSON-parse a sealed value. */
export function openEnvelopeJson<T>(
  recipientKemSecretKey: Uint8Array,
  envelope: SealedEnvelope,
  options?: OpenEnvelopeOptions,
): T {
  return JSON.parse(
    bytesToUtf8(openEnvelope(recipientKemSecretKey, envelope, options)),
  ) as T;
}
