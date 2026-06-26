/**
 * Client-side encrypt/decrypt for a profile's personal fields, via a VaultSession.
 *
 * Encrypted: display_name, birthdate, parent_notes, memory, avatar_config, and
 * avatar_pin — all sealed under the account VMK so the server stays blind.
 *
 * - `avatar_config` (the kid's chosen look { color, avatar }) is encrypted
 *   because the avatar choice can leak sensitive inferences (e.g. gender). It is
 *   stored as an `enc:v1:` JSON string in the existing jsonb column and decrypts
 *   back into an object here.
 * - `avatar_pin` is the optional avatar-PIN puzzle: the secret 3-animal sequence
 *   as a JSON-array string, sealed as an opaque field. `null` ⇒ puzzle disabled.
 * - `memory` is written by the AI memory-update flow, which moves client-side in
 *   P2 — once it does, it encrypts the new dossier here rather than the server
 *   writing plaintext.
 */
import type { Json, Profile } from "@dodi/types/database";

import type { VaultSession } from "./session";

/** Decrypt the personal fields of a fetched profile row for display/editing. */
export function decryptProfile(session: VaultSession, row: Profile): Profile {
  return {
    ...row,
    display_name: session.decryptField(row.display_name) ?? "",
    birthdate: session.decryptField(row.birthdate),
    parent_notes: session.decryptField(row.parent_notes),
    memory: session.decryptField(row.memory),
    avatar_config: decryptAvatarConfig(session, row.avatar_config),
    avatar_pin: session.decryptField(row.avatar_pin),
  };
}

/**
 * `avatar_config` is stored as an `enc:v1:` JSON string (a jsonb string scalar);
 * decrypt it back to the `{ color, avatar }` object. `null` and any non-string
 * (no plaintext objects are written, but be defensive) pass through unchanged.
 */
function decryptAvatarConfig(
  session: VaultSession,
  raw: Json | null,
): Json | null {
  if (raw == null) return null;
  if (typeof raw === "string") return session.decryptJson<Json>(raw);
  return raw;
}

export interface ProfilePersonalFields {
  display_name?: string;
  birthdate?: string | null;
  parent_notes?: string | null;
  memory?: string | null;
  /** Plain `{ color, avatar }` object in; sealed `enc:v1:` JSON string out. */
  avatar_config?: Json | null;
  /** JSON-array string of 3 avatar ids in; sealed `enc:v1:` out. `null` clears. */
  avatar_pin?: string | null;
}

/**
 * Encrypt the present personal fields of a create/update payload. Only fields
 * that are present and a string (or, for avatar_config, a non-null object) are
 * sealed; absent / null pass through.
 */
export function encryptProfileFields<T extends ProfilePersonalFields>(
  session: VaultSession,
  fields: T,
): T {
  const out: T = { ...fields };
  if (typeof out.display_name === "string") {
    out.display_name = session.encryptField(out.display_name);
  }
  if (typeof out.birthdate === "string") {
    out.birthdate = session.encryptField(out.birthdate);
  }
  if (typeof out.parent_notes === "string") {
    out.parent_notes = session.encryptField(out.parent_notes);
  }
  if (typeof out.memory === "string") {
    out.memory = session.encryptField(out.memory);
  }
  if (out.avatar_config != null && typeof out.avatar_config === "object") {
    out.avatar_config = session.encryptJson(out.avatar_config);
  }
  if (typeof out.avatar_pin === "string") {
    out.avatar_pin = session.encryptField(out.avatar_pin);
  }
  return out;
}
