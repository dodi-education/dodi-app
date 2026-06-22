/**
 * Centralized request/response Zod schemas — one source of truth shared by the
 * platform handlers (validation) and the typed client (request shapes). Schemas
 * migrate here incrementally as routes are touched; the vault-keys + envelope
 * schemas are the first, since the device mailbox (P8) depends on the envelope.
 */
import { z } from "zod/v4";

export const KemWrappedKeySchema = z.object({
  v: z.literal(1),
  scheme: z.literal("kem"),
  alg: z.literal("ml-kem-768"),
  kemCiphertext: z.string().min(1),
  nonce: z.string().min(1),
  ciphertext: z.string().min(1),
});

export const PasswordWrappedKeySchema = z.object({
  v: z.literal(1),
  scheme: z.literal("password"),
  kdf: z.literal("argon2id"),
  salt: z.string().min(1),
  params: z.object({
    t: z.number().int().positive(),
    m: z.number().int().positive(),
    p: z.number().int().positive(),
    dkLen: z.number().int().positive(),
  }),
  nonce: z.string().min(1),
  ciphertext: z.string().min(1),
});

export const StoredVaultKeysSchema = z.object({
  deviceWraps: z.array(
    z.object({
      deviceId: z.string().min(1),
      deviceKemPublicKey: z.string().min(1),
      wrapped: KemWrappedKeySchema,
    }),
  ),
  passwordWrap: PasswordWrappedKeySchema.nullable(),
  vmkCheck: z.string().min(1),
});

/** Opaque sealed envelope for the device mailbox — server validates structure only. */
export const SealedEnvelopeSchema = z.object({
  v: z.literal(1),
  keyWrap: KemWrappedKeySchema,
  nonce: z.string().min(1),
  ciphertext: z.string().min(1),
  senderSignPublicKey: z.string().min(1),
  signature: z.string().min(1),
});
