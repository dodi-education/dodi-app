/**
 * Client-side seal/open for a family's own avatars and accessories
 * (character_assets), via a VaultSession.
 *
 * Sealed under the account VMK: `name_enc` (the display name), `meta_enc`
 * (JSON CharacterAssetMeta) and `glb_enc` (the .glb's bytes as standard
 * base64, sealed as one enc:v1 record). `kind` and `byte_size` stay plaintext
 * for the server's limits. The file is checked with @dodi/character's
 * validateCharacterAsset before it is sealed: the server can't look inside.
 */
import { fromBase64Url, toBase64Url } from "@dodi/crypto";
import type { CharacterAsset, CharacterAssetKind, CharacterAssetSummary } from "@dodi/types/database";

import type { VaultSession } from "./session";

/** Sealed JSON in meta_enc. */
export interface CharacterAssetMeta {
  v: 1;
  description?: string;
  /** The socket an accessory rides on (validateCharacterAsset's info.socket). */
  socket?: string;
}

/** An asset's opened list fields. */
export interface CharacterAssetView {
  id: string;
  kind: CharacterAssetKind;
  name: string;
  meta: CharacterAssetMeta;
  byteSize: number;
  createdAt: string;
  updatedAt: string;
}

/** Plain fields in; their sealed columns out. */
export interface CharacterAssetFields {
  name?: string;
  /** NULL clears it. */
  meta?: CharacterAssetMeta | null;
  /** The .glb file; byte_size comes with it. */
  glb?: Uint8Array;
}

export interface SealedCharacterAssetFields {
  name_enc?: string;
  meta_enc?: string | null;
  glb_enc?: string;
  byte_size?: number;
}

/** Bytes → standard, padded base64 (the plaintext inside glb_enc). */
export function bytesToBase64(bytes: Uint8Array): string {
  const url = toBase64Url(bytes).replace(/-/g, "+").replace(/_/g, "/");
  return url + "=".repeat((4 - (url.length % 4)) % 4);
}

/** Standard or url-safe base64, padded or not → bytes. */
export function base64ToBytes(value: string): Uint8Array {
  return fromBase64Url(value.trim().replace(/\+/g, "-").replace(/\//g, "_"));
}

/** Seals the present fields; a file brings its plaintext byte_size along. */
export function encryptCharacterAssetFields(
  session: VaultSession,
  fields: CharacterAssetFields,
): SealedCharacterAssetFields {
  const out: SealedCharacterAssetFields = {};
  if (fields.name !== undefined) out.name_enc = session.encryptField(fields.name);
  if (fields.meta !== undefined) out.meta_enc = fields.meta === null ? null : session.encryptJson(fields.meta);
  if (fields.glb !== undefined) {
    out.glb_enc = session.encryptField(bytesToBase64(fields.glb));
    out.byte_size = fields.glb.length;
  }
  return out;
}

/** A meta record as stored is untrusted: unknown fields drop, a broken one reads as empty. */
export function sanitizeCharacterAssetMeta(raw: unknown): CharacterAssetMeta {
  if (typeof raw !== "object" || raw === null) return { v: 1 };
  const record = raw as Record<string, unknown>;
  const meta: CharacterAssetMeta = { v: 1 };
  if (typeof record.description === "string") meta.description = record.description;
  if (typeof record.socket === "string") meta.socket = record.socket;
  return meta;
}

function openMeta(session: VaultSession, metaEnc: string | null): CharacterAssetMeta {
  if (metaEnc == null) return { v: 1 };
  try {
    return sanitizeCharacterAssetMeta(session.decryptJson<unknown>(metaEnc));
  } catch {
    return { v: 1 };
  }
}

/**
 * Opens an asset's list fields (no file). Null when the name doesn't open
 * (another vault's record, or tampered): the asset is left out, not shown broken.
 */
export function decryptCharacterAsset(
  session: VaultSession,
  row: CharacterAssetSummary,
): CharacterAssetView | null {
  let name: string | null;
  try {
    name = session.decryptField(row.name_enc);
  } catch {
    return null;
  }
  if (name === null) return null;
  return {
    id: row.id,
    kind: row.kind,
    name,
    meta: openMeta(session, row.meta_enc),
    byteSize: row.byte_size,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Opens an asset's .glb bytes (throws when it doesn't open). */
export function decryptCharacterAssetGlb(session: VaultSession, row: Pick<CharacterAsset, "glb_enc">): Uint8Array {
  const base64 = session.decryptField(row.glb_enc);
  if (base64 === null) throw new Error("character asset has no file");
  return base64ToBytes(base64);
}
