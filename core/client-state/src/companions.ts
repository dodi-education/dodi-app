/**
 * A kid's companions: create, rename, re-persona, restyle, switch, delete.
 * Companions travel with the kid (the kid read shape embeds them), so every
 * flow writes, then mirrors the change into the kid cache (`patchLocal`) or
 * drops it (`invalidate`) when the server decided something (ids, order).
 *
 * E2EE: the name and the look (avatar model, colors, accessories) are sealed
 * with the vault before they leave the device (`encryptCompanionFields`).
 */
import { CHARACTER_MODELS } from "@dodi/character/character-catalog";
import { defaultLook, sanitizeLook, type CompanionLook } from "@dodi/character/character-look";
import type { Json, Kid, KidActivePersona, KidCompanion, Persona } from "@dodi/types/database";
import { encryptCompanionFields, type CompanionPersonalFields } from "@dodi/vault/companion-crypto";
import type { VaultSession } from "@dodi/vault";

import { FlowError, jsonInit, serverErrorOf } from "./flow-error";
import type { KidStore } from "./kid-store";
import type { PlatformApi } from "./platform";
import type { VaultStore } from "./vault-store";

export interface CompanionDeps {
  api: PlatformApi;
  kids: KidStore;
  vault: VaultStore;
}

/** Mirrors MAX_COMPANIONS_PER_KID on the platform. */
export const MAX_COMPANIONS_PER_KID = 6;
export const COMPANION_NAME_MAX_LENGTH = 20;

function sessionOrThrow(vault: VaultStore): VaultSession {
  const session = vault.getState().session;
  if (!session) throw new FlowError("vault_locked");
  return session;
}

// ----- Reading -----------------------------------------------------------------

/** The active companion: the kid's pointer when valid, else the oldest (as the platform). */
export function activeCompanionOf(kid: Pick<Kid, "companions" | "active_companion_id">): KidCompanion | null {
  const companions = kid.companions ?? [];
  return companions.find((c) => c.id === kid.active_companion_id) ?? companions[0] ?? null;
}

/** A DECRYPTED companion's look, sanitized against the catalog. */
export function companionLookOf(companion: KidCompanion | null | undefined): CompanionLook {
  return companion?.look == null ? defaultLook() : sanitizeLook(companion.look);
}

/** A DECRYPTED companion's name: the kid's pick, else its avatar's stock name. */
export function companionNameOf(companion: KidCompanion | null | undefined): string {
  const name = companion?.name?.trim();
  if (name) return name;
  return CHARACTER_MODELS[companionLookOf(companion).model].stockName;
}

function slimPersona(persona: Persona | null): KidActivePersona | null {
  return persona
    ? { id: persona.id, name: persona.name, account_id: persona.account_id, is_system_default: persona.is_system_default }
    : null;
}

/** The kid's cached companions with one replaced, and the derived active persona. */
function withCompanion(kid: Kid, companion: KidCompanion): Partial<Kid> {
  const companions = kid.companions.map((c) => (c.id === companion.id ? companion : c));
  const next = { ...kid, companions };
  return { companions, active_persona: activeCompanionOf(next)?.persona ?? null };
}

function cachedKid(deps: CompanionDeps, kidId: string): Kid {
  const state = deps.kids.getState();
  const kid = state.byId[kidId] ?? state.list?.find((k) => k.id === kidId);
  if (!kid) throw new FlowError("request_failed", "kid_not_loaded");
  return kid;
}

// ----- Writing -----------------------------------------------------------------

export interface NewCompanionForm {
  name: string;
  personaId: string | null;
}

/** Adds a companion (stock avatar and look) to a kid. */
export async function createCompanion(deps: CompanionDeps, kidId: string, form: NewCompanionForm): Promise<void> {
  const session = sessionOrThrow(deps.vault);
  const name = form.name.trim();
  if (name.length > COMPANION_NAME_MAX_LENGTH) throw new FlowError("too_long");
  const sealed = encryptCompanionFields(session, name ? { name } : {});
  const res = await deps.api.request(
    `/api/kids/${kidId}/companions`,
    jsonInit("POST", { persona_id: form.personaId, ...sealed }),
  );
  if (!res.ok) throw new FlowError("request_failed", await serverErrorOf(res));
  deps.kids.getState().invalidate();
}

async function patchCompanion(
  deps: CompanionDeps,
  kidId: string,
  companionId: string,
  body: object,
  local: Partial<KidCompanion>,
): Promise<void> {
  const kid = cachedKid(deps, kidId);
  const current = kid.companions.find((c) => c.id === companionId);
  if (!current) throw new FlowError("request_failed", "not_found");
  // Optimistic: the change shows at once and is rolled back if the save fails.
  deps.kids.getState().patchLocal(kidId, withCompanion(kid, { ...current, ...local }));
  const rollback = (): void =>
    deps.kids.getState().patchLocal(kidId, withCompanion(cachedKid(deps, kidId), current));
  let res: Response;
  try {
    res = await deps.api.request(`/api/companions/${companionId}`, jsonInit("PATCH", body));
  } catch (err) {
    rollback();
    throw err;
  }
  if (!res.ok) {
    rollback();
    throw new FlowError("request_failed", await serverErrorOf(res));
  }
}

/** Renames a companion; an empty name goes back to the avatar's stock name. */
export async function renameCompanion(
  deps: CompanionDeps,
  kidId: string,
  companionId: string,
  name: string,
): Promise<void> {
  const session = sessionOrThrow(deps.vault);
  const trimmed = name.trim();
  if (trimmed.length > COMPANION_NAME_MAX_LENGTH) throw new FlowError("too_long");
  const fields: CompanionPersonalFields = { name: trimmed || null };
  const sealed = encryptCompanionFields(session, fields);
  await patchCompanion(deps, kidId, companionId, sealed, { ...sealed, name: trimmed || null });
}

/** Saves a companion's look (sanitized first). */
export async function saveCompanionLook(
  deps: CompanionDeps,
  kidId: string,
  companionId: string,
  look: CompanionLook,
): Promise<void> {
  const session = sessionOrThrow(deps.vault);
  const clean = sanitizeLook(look);
  const sealed = encryptCompanionFields(session, { look: clean as unknown as Json });
  await patchCompanion(deps, kidId, companionId, sealed, { ...sealed, look: clean as unknown as Json });
}

/**
 * Sets a companion's persona (null = the default). `personas` are the
 * DECRYPTED options the picker shows (names match the cached kid shape).
 */
export async function setCompanionPersona(
  deps: CompanionDeps,
  kidId: string,
  companionId: string,
  personaId: string | null,
  personas: Persona[],
): Promise<void> {
  const picked = personaId ? (personas.find((p) => p.id === personaId) ?? null) : null;
  await patchCompanion(deps, kidId, companionId, { persona_id: personaId }, {
    persona_id: personaId,
    persona: slimPersona(picked),
  });
}

/** Makes one of the kid's companions the active one. */
export async function setActiveCompanion(deps: CompanionDeps, kidId: string, companionId: string): Promise<void> {
  const res = await deps.api.request(`/api/kids/${kidId}`, jsonInit("PATCH", { active_companion_id: companionId }));
  if (!res.ok) throw new FlowError("request_failed", await serverErrorOf(res));
  const kid = cachedKid(deps, kidId);
  const next = { ...kid, active_companion_id: companionId };
  deps.kids.getState().patchLocal(kidId, {
    active_companion_id: companionId,
    active_persona: activeCompanionOf(next)?.persona ?? null,
  });
}

/** Deletes a companion (the platform refuses the last one). */
export async function deleteCompanion(deps: CompanionDeps, companionId: string): Promise<void> {
  const res = await deps.api.request(`/api/companions/${companionId}`, { method: "DELETE" });
  if (!res.ok) throw new FlowError("request_failed", await serverErrorOf(res));
  deps.kids.getState().invalidate();
}
