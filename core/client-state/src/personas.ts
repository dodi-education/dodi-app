/**
 * The parent's personas (/parent/personas, /new, /{id}): list, create /
 * import, edit, clone, delete and export the `soul` documents.
 *
 * E2EE: an account persona's `name` and `soul` are sealed under the account
 * vault before they leave the device and opened here for display; the system
 * default is plaintext and passes through. Kid rows embed the active persona
 * (its name included), so renames and deletes drop the kid cache.
 */
import type { Persona } from "@dodi/types/database";
import { decryptPersona, encryptPersonaFields } from "@dodi/vault/persona-crypto";
import type { VaultSession } from "@dodi/vault";

import { FlowError, jsonInit, serverErrorOf } from "./flow-error";
import type { KidStore } from "./kid-store";
import type { PlatformApi } from "./platform";
import type { VaultStore } from "./vault-store";

export interface PersonaDeps {
  api: PlatformApi;
  vault: VaultStore;
  kids: KidStore;
}

/** Plaintext soul cap (enforced client-side; the server only sees ciphertext). */
export const MAX_SOUL_LENGTH = 50000;
export const PERSONA_NAME_MAX_LENGTH = 100;

/**
 * The account's personas, DECRYPTED for display (the system default passes
 * through). [] when the request fails.
 */
export async function loadPersonas(api: PlatformApi, session: VaultSession): Promise<Persona[]> {
  try {
    const res = await api.request("/api/personas");
    if (!res.ok) return [];
    const rows = (await res.json()) as unknown;
    if (!Array.isArray(rows)) return [];
    return (rows as Persona[]).map((p) => decryptPersona(session, p));
  } catch {
    return [];
  }
}

/**
 * One persona for the detail page, decrypted when the vault is open. Null
 * when it doesn't exist (or isn't this account's).
 */
export async function loadPersona(
  deps: Pick<PersonaDeps, "api" | "vault">,
  id: string,
): Promise<Persona | null> {
  const res = await deps.api.request(`/api/personas/${id}`);
  if (!res.ok) return null;
  const row = (await res.json()) as Persona;
  const session = deps.vault.getState().session;
  return session ? decryptPersona(session, row) : row;
}

/** The list row's one-line summary: the soul's first bullet, bold markers stripped. */
export function personaSummary(soul: string): string | null {
  return (
    soul
      .split("\n")
      .find((l) => l.startsWith("- "))
      ?.replace(/^- /, "")
      .replace(/\*\*/g, "") ?? null
  );
}

/** Which required fields are empty (the form marks them aria-invalid). */
export function invalidPersonaFields(form: { name: string; soul: string }): {
  name: boolean;
  soul: boolean;
} {
  return { name: !form.name.trim(), soul: !form.soul.trim() };
}

/** An imported `.soul.md` / `.md` file's name as a persona name ("explorer.soul.md" → "Explorer"). */
export function personaNameFromFileName(fileName: string): string {
  const baseName = fileName.replace(/\.soul\.md$|\.md$/, "");
  return baseName.charAt(0).toUpperCase() + baseName.slice(1);
}

/** The export's file name: the persona name as a slug, `.soul.md`. */
export function soulFileName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "persona"}.soul.md`;
}

/** The default name of a clone of `name`. */
export function cloneNameOf(name: string): string {
  return `${name} (Copy)`;
}

function sealedFields(
  vault: VaultStore,
  fields: { name: string; soul: string },
): { name: string; soul: string } {
  if (fields.soul.length > MAX_SOUL_LENGTH) throw new FlowError("too_long");
  const session = vault.getState().session;
  if (!session) throw new FlowError("vault_locked");
  // Seal `name` and `soul` under the account VMK before they leave the device.
  return encryptPersonaFields(session, fields);
}

/**
 * Create an account persona (also the import and clone path: the soul is
 * read on the device and sealed like a typed one, never sent raw).
 */
export async function createPersona(
  deps: PersonaDeps,
  fields: { name: string; soul: string },
): Promise<void> {
  const body = sealedFields(deps.vault, fields);
  const res = await deps.api.request("/api/personas", jsonInit("POST", body));
  if (!res.ok) throw new FlowError("request_failed", await serverErrorOf(res));
}

/** Save an account persona's name and soul; kid rows embed the name, so they refetch. */
export async function updatePersona(
  deps: PersonaDeps,
  id: string,
  fields: { name: string; soul: string },
): Promise<void> {
  const body = sealedFields(deps.vault, fields);
  const res = await deps.api.request(`/api/personas/${id}`, jsonInit("PATCH", body));
  if (!res.ok) throw new FlowError("request_failed", await serverErrorOf(res));
  deps.kids.getState().invalidate();
}

/**
 * Clone a persona (the plaintext default, or a decrypted custom one) into a
 * new account-owned persona sealed under this account's VMK. Unlike a typed
 * soul, the source is not length-checked (the web never did).
 */
export async function clonePersona(
  deps: PersonaDeps,
  fields: { name: string; soul: string },
): Promise<void> {
  const session = deps.vault.getState().session;
  if (!session) throw new FlowError("vault_locked");
  const res = await deps.api.request("/api/personas", jsonInit("POST", encryptPersonaFields(session, fields)));
  if (!res.ok) throw new FlowError("request_failed", await serverErrorOf(res));
}

/** Delete an account persona; referencing kids fall back to the default (FK SET NULL). */
export async function deletePersona(deps: PersonaDeps, id: string): Promise<void> {
  const res = await deps.api.request(`/api/personas/${id}`, { method: "DELETE" });
  if (!res.ok) throw new FlowError("request_failed");
  deps.kids.getState().invalidate();
}
