/**
 * Client-side encrypt/decrypt for a profile's personal fields, via a VaultSession.
 *
 * Encrypted: display_name, birthdate, parent_notes, and `memory`. (`memory` is
 * written by the AI memory-update flow, which moves client-side in P2 — once it
 * does, it encrypts the new dossier here rather than the server writing plaintext.)
 */
import type { Profile } from "@dodi/types/database";

import type { VaultSession } from "./session";

/** Decrypt the personal fields of a fetched profile row for display/editing. */
export function decryptProfile(session: VaultSession, row: Profile): Profile {
  return {
    ...row,
    display_name: session.decryptField(row.display_name) ?? "",
    birthdate: session.decryptField(row.birthdate),
    parent_notes: session.decryptField(row.parent_notes),
    memory: session.decryptField(row.memory),
  };
}

export interface ProfilePersonalFields {
  display_name?: string;
  birthdate?: string | null;
  parent_notes?: string | null;
  memory?: string | null;
}

/**
 * Encrypt the present personal fields of a create/update payload. Only fields
 * that are present and a string are sealed (absent / null pass through).
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
  return out;
}
