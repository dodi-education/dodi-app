/**
 * Client-side encrypt/decrypt for an account persona's `name` and `soul` (the
 * AI personality doc), via a VaultSession.
 *
 * Only ACCOUNT-OWNED personas are encrypted. The global default persona
 * (is_system_default / no account_id) is a shared, built-in document with no
 * per-account key, so it stays plaintext — the server seeds and reads it.
 *
 * Both `name` and `soul` are sealed under the account VMK so the server stays
 * blind: a persona's label can itself leak (e.g. a child's name or a sensitive
 * context). `decryptField` passes legacy plaintext through unchanged, so any
 * account persona written before encryption keeps working until it is next
 * saved (at which point it is sealed).
 */
import type { Persona } from "@dodi/types/database";

import type { VaultSession } from "./session";

export function isEncryptablePersona(
  persona: Pick<Persona, "account_id" | "is_system_default">,
): boolean {
  return !persona.is_system_default && persona.account_id != null;
}

/** Decrypt an account persona's `name`/`soul` for display or editing. */
export function decryptPersona(session: VaultSession, persona: Persona): Persona {
  if (!isEncryptablePersona(persona)) return persona;
  return {
    ...persona,
    name: session.decryptField(persona.name) ?? persona.name,
    soul: session.decryptField(persona.soul) ?? "",
  };
}

export interface PersonaPersonalFields {
  name?: string;
  soul?: string;
}

/**
 * Encrypt the present `name`/`soul` of a create/update payload. Only fields
 * that are present and a string are sealed; absent fields pass through. Call
 * this only for account-owned personas — the system default stays plaintext.
 */
export function encryptPersonaFields<T extends PersonaPersonalFields>(
  session: VaultSession,
  fields: T,
): T {
  const out: T = { ...fields };
  if (typeof out.name === "string") out.name = session.encryptField(out.name);
  if (typeof out.soul === "string") out.soul = session.encryptField(out.soul);
  return out;
}
