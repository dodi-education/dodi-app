import { describe, expect, it } from "vitest";

import type { Persona } from "@dodi/types/database";
import { encryptPersonaFields } from "@dodi/vault/persona-crypto";

import { flowErrorText } from "./flow-error";
import { bodyOf, json, lockedVault, routedApi, spyKids, unlockedVault } from "./parent-pages.test-support";
import {
  MAX_SOUL_LENGTH,
  clonePersona,
  cloneNameOf,
  createPersona,
  deletePersona,
  invalidPersonaFields,
  loadPersona,
  loadPersonas,
  personaNameFromFileName,
  personaSummary,
  soulFileName,
  updatePersona,
} from "./personas";

const SYSTEM = { id: "p0", name: "dodi", soul: "- **Curious** friend", account_id: null, is_system_default: true } as unknown as Persona;

describe("personas", () => {
  it("lists personas decrypted (the system default passes through), [] on failure", async () => {
    const { session } = unlockedVault();
    const custom = {
      id: "p1",
      account_id: "a1",
      is_system_default: false,
      ...encryptPersonaFields(session, { name: "Coach", soul: "Be kind" }),
    } as unknown as Persona;
    const api = routedApi({ "/api/personas": json([SYSTEM, custom]) });
    const list = await loadPersonas(api, session);
    expect(list.map((p) => [p.name, p.soul])).toEqual([
      ["dodi", "- **Curious** friend"],
      ["Coach", "Be kind"],
    ]);
    await expect(loadPersonas(routedApi({ "/api/personas": json({}, 500) }), session)).resolves.toEqual([]);
    await expect(loadPersonas(routedApi({ "/api/personas": new TypeError("offline") }), session)).resolves.toEqual([]);
  });

  it("loads one persona, null when missing", async () => {
    const { vault } = unlockedVault();
    await expect(loadPersona({ api: routedApi({ "/api/personas/p0": json(SYSTEM) }), vault }, "p0")).resolves.toEqual(SYSTEM);
    await expect(loadPersona({ api: routedApi({ "/api/personas/x": json({}, 404) }), vault }, "x")).resolves.toBeNull();
  });

  it("derives the summary, file names and clone name", () => {
    expect(personaSummary("# Soul\n- **Warm** and patient\n- other")).toBe("Warm and patient");
    expect(personaSummary("no bullets")).toBeNull();
    expect(personaNameFromFileName("explorer.soul.md")).toBe("Explorer");
    expect(personaNameFromFileName("coach.md")).toBe("Coach");
    expect(soulFileName("My Coach!")).toBe("my-coach.soul.md");
    expect(soulFileName("###")).toBe("persona.soul.md");
    expect(cloneNameOf("dodi")).toBe("dodi (Copy)");
    expect(invalidPersonaFields({ name: "", soul: " " })).toEqual({ name: true, soul: true });
  });

  it("creates and updates sealed; an update drops the kid cache", async () => {
    const { vault, session } = unlockedVault();
    const { kids, invalidate } = spyKids();
    const api = routedApi({ "/api/personas": json({}, 201), "/api/personas/p1": json({}) });

    await createPersona({ api, vault, kids }, { name: "Coach", soul: "Be kind" });
    const created = bodyOf(api, "/api/personas");
    expect(session.decryptField(created.name as string)).toBe("Coach");
    expect(session.decryptField(created.soul as string)).toBe("Be kind");
    expect(invalidate).not.toHaveBeenCalled();

    await updatePersona({ api, vault, kids }, "p1", { name: "Coach 2", soul: "Be kinder" });
    expect(session.decryptField(bodyOf(api, "/api/personas/p1").name as string)).toBe("Coach 2");
    expect(invalidate).toHaveBeenCalled();
  });

  it("rejects an over-long soul before checking the vault, and maps errors", async () => {
    const { kids } = spyKids();
    const api = routedApi({ "/api/personas": json({ error: "Nope" }, 400) });
    const long = { name: "A", soul: "x".repeat(MAX_SOUL_LENGTH + 1) };
    const tooLong = await createPersona({ api, vault: lockedVault(), kids }, long).catch((e: unknown) => e);
    expect(flowErrorText(tooLong, "failed", { tooLong: "too long" })).toBe("too long");

    const locked = await createPersona({ api, vault: lockedVault(), kids }, { name: "A", soul: "b" }).catch((e: unknown) => e);
    expect(flowErrorText(locked, "failed", { vaultLocked: "failed" })).toBe("failed");

    const server = await createPersona({ api, vault: unlockedVault().vault, kids }, { name: "A", soul: "b" }).catch((e: unknown) => e);
    expect(flowErrorText(server, "failed")).toBe("Nope");
    expect(api.request).toHaveBeenCalledTimes(1);
  });

  it("clones into a sealed account persona and deletes (kid cache dropped)", async () => {
    const { vault, session } = unlockedVault();
    const { kids, invalidate } = spyKids();
    const api = routedApi({ "POST /api/personas": json({}, 201), "DELETE /api/personas/p1": json({}) });
    await clonePersona({ api, vault, kids }, { name: "dodi (Copy)", soul: SYSTEM.soul });
    expect(session.decryptField(bodyOf(api, "/api/personas").soul as string)).toBe(SYSTEM.soul);
    await deletePersona({ api, vault, kids }, "p1");
    expect(invalidate).toHaveBeenCalled();
  });
});
