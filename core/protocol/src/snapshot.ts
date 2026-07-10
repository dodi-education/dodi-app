/**
 * Game snapshots — the E2EE mechanism for saving a game moment (code + full
 * restorable state + thumbnail) and sharing it with a friend.
 *
 * Every snapshot is stored as TWO sealed blobs: a light `info` blob (title,
 * game title, thumbnail — decrypted to render the collection) and a heavy
 * `payload` blob (game code + metadata + save state — fetched on open). A
 * kid's OWN snapshots are sealed under the account Vault Master Key
 * (`enc:v1:`); a SHARED copy is sealed to the recipient kid's friend KEM
 * public key and signed by the sender kid — exactly the friend-card envelope
 * (`./envelope`). The server stores the opaque blobs and only gates delivery
 * (accepted friendship); it can never read them.
 *
 * Decrypted content is zod-validated before use: a received payload comes
 * from another family's client, so shape and size limits are enforced here
 * (the game code is additionally re-sanitized by the player before injection).
 */
import { type SignKeyPair, fromBase64Url } from "@dodi/crypto";
import type {
  SnapshotInfoV1,
  SnapshotPayloadV1,
} from "@dodi/types/games";
import { VaultSession } from "@dodi/vault";
import { z } from "zod/v4";

import {
  type SealedEnvelope,
  openEnvelopeJson,
  sealEnvelopeJson,
} from "./envelope";

/** Generous cap over the 200 KB generation limit (see @dodi/games sanitizer). */
export const SNAPSHOT_CODE_BUNDLE_MAX_CHARS = 400_000;
/** Downscaled gallery thumbnail (data URL) — keep listing decrypts cheap. */
export const SNAPSHOT_THUMBNAIL_MAX_CHARS = 200_000;
/** Full save state incl. visual surfaces as data URLs. */
export const SNAPSHOT_SAVED_STATE_MAX_CHARS = 1_500_000;
export const SNAPSHOT_TITLE_MAX_CHARS = 120;

const JsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

export const SnapshotInfoSchema = z.object({
  v: z.literal(1),
  title: z.string().min(1).max(SNAPSHOT_TITLE_MAX_CHARS),
  gameTitle: z.string().max(200),
  thumbnail: z
    .string()
    .startsWith("data:image")
    .max(SNAPSHOT_THUMBNAIL_MAX_CHARS)
    .nullable(),
  createdAt: z.string().max(64),
});

export const SnapshotPayloadSchema = z
  .object({
    v: z.literal(1),
    title: z.string().min(1).max(SNAPSHOT_TITLE_MAX_CHARS),
    createdAt: z.string().max(64),
    gameId: z.string().uuid().nullable(),
    gameTitle: z.string().max(200),
    gameDescription: z.string().max(2_000),
    gameMarkdown: z.string().max(50_000),
    codeBundle: z.string().min(1).max(SNAPSHOT_CODE_BUNDLE_MAX_CHARS),
    capabilities: z.array(z.string().max(64)).max(50),
    drawingStyle: z.enum(["picture", "mandala"]),
    savedState: z.record(z.string(), JsonValueSchema),
  })
  .superRefine((val, ctx) => {
    if (JSON.stringify(val.savedState).length > SNAPSHOT_SAVED_STATE_MAX_CHARS) {
      ctx.addIssue({ code: "custom", message: "savedState exceeds the size limit" });
    }
  });

function parseInfo(value: unknown): SnapshotInfoV1 {
  return SnapshotInfoSchema.parse(value) as SnapshotInfoV1;
}

function parsePayload(value: unknown): SnapshotPayloadV1 {
  return SnapshotPayloadSchema.parse(value) as SnapshotPayloadV1;
}

/** Approximate plaintext payload size (recorded for future quota enforcement). */
export function estimateSnapshotPayloadBytes(payload: SnapshotPayloadV1): number {
  return new TextEncoder().encode(JSON.stringify(payload)).length;
}

// ── Own snapshots: sealed under the account VMK ────────────────────────────

export function sealOwnSnapshotInfo(
  session: VaultSession,
  info: SnapshotInfoV1,
): string {
  return session.encryptJson(parseInfo(info));
}

export function sealOwnSnapshotPayload(
  session: VaultSession,
  payload: SnapshotPayloadV1,
): string {
  return session.encryptJson(parsePayload(payload));
}

export function openOwnSnapshotInfo(
  session: VaultSession,
  blob: string,
): SnapshotInfoV1 {
  const value = session.decryptJson<unknown>(blob);
  if (value === null) throw new Error("snapshot info blob is missing or empty");
  return parseInfo(value);
}

export function openOwnSnapshotPayload(
  session: VaultSession,
  blob: string,
): SnapshotPayloadV1 {
  const value = session.decryptJson<unknown>(blob);
  if (value === null) throw new Error("snapshot payload blob is missing or empty");
  return parsePayload(value);
}

// ── Shared snapshots: sealed to the recipient kid, signed by the sender ────

/**
 * Seal a snapshot to a friend. `recipientKemPublicKey` is the base64url value
 * from the friendship counterpart. Info and payload are sealed as two
 * independently signed envelopes so the recipient's gallery only ever
 * decrypts the light one. Returns the envelope JSON strings stored verbatim
 * in `info_enc` / `payload_enc`.
 */
export function sealSnapshotForFriend(
  recipientKemPublicKey: string,
  info: SnapshotInfoV1,
  payload: SnapshotPayloadV1,
  sender: SignKeyPair,
): { infoEnvelope: string; payloadEnvelope: string } {
  const recipientKey = fromBase64Url(recipientKemPublicKey);
  const envelopeSender = {
    signPublicKey: sender.publicKey,
    signSecretKey: sender.secretKey,
  };
  return {
    infoEnvelope: JSON.stringify(
      sealEnvelopeJson(recipientKey, parseInfo(info), envelopeSender),
    ),
    payloadEnvelope: JSON.stringify(
      sealEnvelopeJson(recipientKey, parsePayload(payload), envelopeSender),
    ),
  };
}

function openSharedEnvelope(
  recipientKemSecretKey: Uint8Array,
  envelopeJson: string,
  expectedSenderSignPublicKey?: string,
): unknown {
  const envelope = JSON.parse(envelopeJson) as SealedEnvelope;
  return openEnvelopeJson<unknown>(
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

/**
 * Open a received snapshot's info blob with the kid's friend KEM secret key.
 * Pass the sender kid's published signing key (base64url, from the friendship
 * counterpart) to bind the snapshot to that friend and reject a swapped sender.
 */
export function openSharedSnapshotInfo(
  recipientKemSecretKey: Uint8Array,
  envelopeJson: string,
  expectedSenderSignPublicKey?: string,
): SnapshotInfoV1 {
  return parseInfo(
    openSharedEnvelope(
      recipientKemSecretKey,
      envelopeJson,
      expectedSenderSignPublicKey,
    ),
  );
}

export function openSharedSnapshotPayload(
  recipientKemSecretKey: Uint8Array,
  envelopeJson: string,
  expectedSenderSignPublicKey?: string,
): SnapshotPayloadV1 {
  return parsePayload(
    openSharedEnvelope(
      recipientKemSecretKey,
      envelopeJson,
      expectedSenderSignPublicKey,
    ),
  );
}
