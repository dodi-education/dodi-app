import { describe, expect, it } from "vitest";
import { createStore } from "zustand/vanilla";

import type { Kid, KidCompanion, Persona } from "@dodi/types/database";

import {
  activeCompanionOf,
  companionLookOf,
  companionNameOf,
  createCompanion,
  deleteCompanion,
  renameCompanion,
  saveCompanionLook,
  setActiveCompanion,
  setCompanionPersona,
} from "./companions";
import { FlowError } from "./flow-error";
import type { KidStore, KidStoreState } from "./kid-store";
import { bodyOf, json, lockedVault, routedApi, unlockedVault } from "./parent-pages.test-support";

function companion(overrides: Partial<KidCompanion>): KidCompanion {
  return { id: "c1", persona_id: null, name_enc: null, look_enc: null, created_at: "t", persona: null, ...overrides };
}

const EXPLORER = { id: "p1", name: "Explorer", account_id: "a1", is_system_default: false };

function kidWith(companions: KidCompanion[], activeId: string | null): Kid {
  return { id: "k1", companions, active_companion_id: activeId, active_persona: null } as unknown as Kid;
}

/** A real (vanilla) kid store holding one cached kid, with patchLocal merging. */
function cachedKids(kid: Kid): { kids: KidStore; invalidated: () => boolean } {
  let isInvalidated = false;
  const kids = createStore<KidStoreState>()((set, get) => ({
    list: [kid],
    byId: { [kid.id]: kid },
    loadList: async () => get().list ?? [],
    loadOne: async (id) => get().byId[id] ?? null,
    patchLocal: (id, patch) => {
      const next = { ...get().byId[id], ...patch } as Kid;
      set({ byId: { ...get().byId, [id]: next }, list: (get().list ?? []).map((k) => (k.id === id ? next : k)) });
    },
    invalidate: () => {
      isInvalidated = true;
    },
  })) as KidStore;
  return { kids, invalidated: () => isInvalidated };
}

describe("reading companions", () => {
  it("picks the active companion, falling back to the oldest", () => {
    const a = companion({ id: "a" });
    const b = companion({ id: "b" });
    expect(activeCompanionOf(kidWith([a, b], "b"))?.id).toBe("b");
    expect(activeCompanionOf(kidWith([a, b], "gone"))?.id).toBe("a");
    expect(activeCompanionOf(kidWith([], null))).toBeNull();
  });

  it("names a companion by the kid's pick or its avatar's stock name", () => {
    expect(companionNameOf(companion({ name: "Pip" }))).toBe("Pip");
    expect(companionNameOf(companion({ name: "  " }))).toBe("dodi");
    expect(companionNameOf(null)).toBe("dodi");
  });

  it("sanitizes the look", () => {
    expect(companionLookOf(companion({ look: { model: "nope", accessories: ["glasses"] } })).accessories).toEqual([
      "glasses",
    ]);
    expect(companionLookOf(companion({})).model).toBe("dodi");
  });
});

describe("companion flows", () => {
  it("creates a companion with a sealed name and drops the kid cache", async () => {
    const { vault, session } = unlockedVault();
    const { kids, invalidated } = cachedKids(kidWith([companion({})], "c1"));
    const api = routedApi({ "/api/kids/k1/companions": json({ id: "c2" }, 201) });

    await createCompanion({ api, kids, vault }, "k1", { name: "Pip", personaId: "p1" });

    const body = bodyOf(api, "/api/kids/k1/companions");
    expect(body.persona_id).toBe("p1");
    expect(session.decryptField(body.name_enc as string)).toBe("Pip");
    expect(invalidated()).toBe(true);
  });

  it("refuses too long names and a locked vault", async () => {
    const { vault } = unlockedVault();
    const { kids } = cachedKids(kidWith([companion({})], "c1"));
    const api = routedApi({});
    await expect(createCompanion({ api, kids, vault }, "k1", { name: "x".repeat(30), personaId: null })).rejects.toEqual(
      new FlowError("too_long"),
    );
    await expect(
      renameCompanion({ api, kids, vault: lockedVault() }, "k1", "c1", "Pip"),
    ).rejects.toMatchObject({ reason: "vault_locked" });
  });

  it("renames and restyles, mirroring the opened values into the cache", async () => {
    const { vault, session } = unlockedVault();
    const { kids } = cachedKids(kidWith([companion({})], "c1"));
    const api = routedApi({ "/api/companions/c1": json({}) });

    await renameCompanion({ api, kids, vault }, "k1", "c1", " Pip ");
    expect(session.decryptField(bodyOf(api, "/api/companions/c1").name_enc as string)).toBe("Pip");
    expect(kids.getState().byId.k1.companions[0].name).toBe("Pip");

    await saveCompanionLook({ api, kids, vault }, "k1", "c1", {
      v: 1,
      model: "dodi",
      colors: { skin: "#FF8A5C", dark: "#000000" },
      accessories: ["party_hat"],
    });
    const sealed = bodyOf(api, "/api/companions/c1", 1).look_enc as string;
    expect(session.decryptJson(sealed)).toEqual({ v: 1, model: "dodi", colors: { skin: "#ff8a5c" }, accessories: ["party_hat"] });
    expect(companionLookOf(kids.getState().byId.k1.companions[0]).accessories).toEqual(["party_hat"]);
    // Reset to the stock name.
    await renameCompanion({ api, kids, vault }, "k1", "c1", "");
    expect(bodyOf(api, "/api/companions/c1", 2)).toEqual({ name_enc: null });
  });

  it("sets the persona and re-derives the kid's active persona", async () => {
    const { vault } = unlockedVault();
    const { kids } = cachedKids(kidWith([companion({ id: "c1" }), companion({ id: "c2" })], "c2"));
    const api = routedApi({ "/api/companions/c2": json({}), "/api/companions/c1": json({}) });
    const personas = [{ ...EXPLORER, soul: "…" }] as unknown as Persona[];

    await setCompanionPersona({ api, kids, vault }, "k1", "c2", "p1", personas);
    expect(bodyOf(api, "/api/companions/c2")).toEqual({ persona_id: "p1" });
    expect(kids.getState().byId.k1.active_persona).toEqual(EXPLORER);

    // The inactive companion's persona doesn't touch the active persona.
    await setCompanionPersona({ api, kids, vault }, "k1", "c1", null, personas);
    expect(kids.getState().byId.k1.active_persona).toEqual(EXPLORER);
  });

  it("switches the active companion", async () => {
    const { vault } = unlockedVault();
    const { kids } = cachedKids(kidWith([companion({ id: "c1" }), companion({ id: "c2", persona: EXPLORER })], "c1"));
    const api = routedApi({ "/api/kids/k1": json({}) });

    await setActiveCompanion({ api, kids, vault }, "k1", "c2");
    expect(bodyOf(api, "/api/kids/k1")).toEqual({ active_companion_id: "c2" });
    expect(kids.getState().byId.k1.active_companion_id).toBe("c2");
    expect(kids.getState().byId.k1.active_persona).toEqual(EXPLORER);
  });

  it("deletes a companion and reports the server's refusal", async () => {
    const { vault } = unlockedVault();
    const { kids, invalidated } = cachedKids(kidWith([companion({})], "c1"));
    await deleteCompanion({ api: routedApi({ "DELETE /api/companions/c2": json({}) }), kids, vault }, "c2");
    expect(invalidated()).toBe(true);
    await expect(
      deleteCompanion({ api: routedApi({ "DELETE /api/companions/c1": json({ error: "last_companion" }, 409) }), kids, vault }, "c1"),
    ).rejects.toMatchObject({ reason: "request_failed", message: "last_companion" });
  });
});

describe("optimistic companion writes", () => {
  it("shows the change at once and rolls it back when the save fails", async () => {
    const { vault } = unlockedVault();
    const { kids } = cachedKids(kidWith([companion({ name: "Pip" })], "c1"));
    let seen: string | null | undefined;
    const api = routedApi({
      "/api/companions/c1": () => {
        seen = kids.getState().byId.k1.companions[0].name;
        return json({ error: "nope" }, 500);
      },
    });
    await expect(renameCompanion({ api, kids, vault }, "k1", "c1", "Zed")).rejects.toMatchObject({ message: "nope" });
    expect(seen).toBe("Zed");
    expect(kids.getState().byId.k1.companions[0].name).toBe("Pip");
  });
});
