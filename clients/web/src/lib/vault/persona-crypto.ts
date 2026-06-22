/**
 * Client-side encrypt/decrypt for a persona's `soul` (the AI personality doc),
 * via a VaultSession.
 *
 * Only ACCOUNT-OWNED personas are encrypted. The global default persona
 * (is_system_default / no account_id) is a shared, built-in document with no
 * per-account key, so it stays plaintext.
 */
import type { Persona } from "@dodi/types/database";

import type { VaultSession } from "./session";

export function isEncryptablePersona(
  persona: Pick<Persona, "account_id" | "is_system_default">,
): boolean {
  return !persona.is_system_default && persona.account_id != null;
}

export function decryptPersona(session: VaultSession, persona: Persona): Persona {
  if (!isEncryptablePersona(persona)) return persona;
  return { ...persona, soul: session.decryptField(persona.soul) ?? "" };
}

export function encryptPersonaSoul(session: VaultSession, soul: string): string {
  return session.encryptField(soul);
}
