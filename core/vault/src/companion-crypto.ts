/**
 * Client-side encrypt/decrypt for a companion's sealed fields, via a
 * VaultSession.
 *
 * Sealed under the account VMK: `name_enc` (the kid-chosen name) and
 * `look_enc` (JSON CompanionLook: avatar model, colors, accessories). The look
 * is sealed because the avatar choice can leak inferences, like a kid's own
 * avatar_config. NULL means "the catalog defaults" and is what the server
 * writes for a new kid's default companion.
 *
 * The embedded persona's `name` is ciphertext for account personas and opens
 * with the same rule as decryptPersona.
 */
import type { Json, KidActivePersona, KidCompanion } from "@dodi/types/database";

import { isEncryptablePersona } from "./persona-crypto";
import type { VaultSession } from "./session";

export function decryptEmbeddedPersona(
  session: VaultSession,
  persona: KidActivePersona | null,
): KidActivePersona | null {
  if (!persona || !isEncryptablePersona(persona)) return persona;
  return { ...persona, name: session.decryptField(persona.name) ?? persona.name };
}

/** Opens a companion embed into `name` / `look` (ciphertext fields kept). */
export function decryptCompanion(session: VaultSession, row: KidCompanion): KidCompanion {
  return {
    ...row,
    persona: decryptEmbeddedPersona(session, row.persona),
    name: row.name_enc == null ? null : session.decryptField(row.name_enc),
    look: openLook(session, row.look_enc),
  };
}

/**
 * A look that does not open or parse reads as the defaults rather than taking
 * the whole kid row down; clients sanitize what does open against the catalog.
 */
function openLook(session: VaultSession, lookEnc: string | null): Json | null {
  if (lookEnc == null) return null;
  try {
    return session.decryptJson<Json>(lookEnc);
  } catch {
    return null;
  }
}

export interface CompanionPersonalFields {
  /** Plain name in; NULL clears back to the stock name. */
  name?: string | null;
  /** Plain CompanionLook object in; NULL clears back to the defaults. */
  look?: Json | null;
}

export interface SealedCompanionFields {
  name_enc?: string | null;
  look_enc?: string | null;
}

/** Seals the present fields into their `_enc` columns; absent stays absent. */
export function encryptCompanionFields(
  session: VaultSession,
  fields: CompanionPersonalFields,
): SealedCompanionFields {
  const out: SealedCompanionFields = {};
  if (fields.name !== undefined) {
    out.name_enc = fields.name === null ? null : session.encryptField(fields.name);
  }
  if (fields.look !== undefined) {
    out.look_enc = fields.look === null ? null : session.encryptJson(fields.look);
  }
  return out;
}
