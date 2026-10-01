import { beforeEach, describe, expect, it } from "vitest";

import type { Kid } from "@dodi/types/database";

import { type ActiveKidStore, createActiveKidStore } from "./active-kid-store";
import type { ActiveKidPersistence } from "./platform";

function kid(id: string, extra: Partial<Kid> = {}): Kid {
  return { id, avatar_pin: null, language: "en", ...extra } as Kid;
}

/** Session-scoped persistence that outlives a store (a full-document navigation). */
function memoryPersistence(): ActiveKidPersistence {
  let activeKidId: string | null = null;
  let unlocked: string[] = [];
  return {
    readActiveKidId: () => activeKidId,
    writeActiveKid: (k) => {
      activeKidId = k.id;
    },
    readUnlockedKidIds: () => new Set(unlocked),
    writeUnlockedKidIds: (ids) => {
      unlocked = [...ids];
    },
  };
}

let persistence: ActiveKidPersistence;
let store: ActiveKidStore;

// A fresh store per test models a fresh page-load (no in-memory unlocks).
beforeEach(() => {
  persistence = memoryPersistence();
  store = createActiveKidStore(persistence);
});

describe("resolve", () => {
  // Nothing persisted yet: exactly the cold "/" entry that used to leave the
  // home page on "No kid selected". It must select the first available profile.
  it("selects the first available profile on a cold entry", () => {
    store.getState().resolve([kid("first"), kid("second")]);
    expect(store.getState().activeKidId).toBe("first");
  });

  it("resolves to null for an account with no kids", () => {
    store.getState().resolve([]);
    expect(store.getState().activeKidId).toBeNull();
  });

  it("keeps the persisted kid while it still exists, and persists a fallback", () => {
    store.getState().setActive(kid("b"));
    const nextPage = createActiveKidStore(persistence);
    nextPage.getState().resolve([kid("a"), kid("b")]);
    expect(nextPage.getState().activeKidId).toBe("b");

    nextPage.getState().resolve([kid("a")]);
    expect(nextPage.getState().activeKidId).toBe("a");
    expect(persistence.readActiveKidId()).toBe("a");
  });

  it("is stable when re-resolved against the same list", () => {
    const { resolve } = store.getState();
    resolve([kid("a"), kid("b")]);
    const first = store.getState().activeKidId;
    resolve([kid("a"), kid("b")]);
    expect(store.getState().activeKidId).toBe(first);
  });
});

describe("unlock lifecycle", () => {
  it("starts with nothing unlocked (a hard refresh re-prompts)", () => {
    expect(store.getState().unlockedKidIds.size).toBe(0);
  });

  it("markUnlocked records a solved profile for this page-load", () => {
    store.getState().markUnlocked("a");
    expect(store.getState().unlockedKidIds.has("a")).toBe(true);
  });

  it("setActive switches the active kid and unlocks it", () => {
    store.getState().setActive(kid("b"));
    const state = store.getState();
    expect(state.activeKidId).toBe("b");
    expect(state.unlockedKidIds.has("b")).toBe(true);
  });

  it("markUnlocked returns a new Set reference so subscribers re-render", () => {
    const before = store.getState().unlockedKidIds;
    store.getState().markUnlocked("a");
    expect(store.getState().unlockedKidIds).not.toBe(before);
  });

  // Offline tab switches are FULL-document navigations (the service worker
  // serves cached shells; connectivity-aware links force location.assign), so
  // in-memory-only unlocks would re-prompt the puzzle on every offline
  // navigation. Unlocks must survive a reload within the same tab session —
  // same tradeoff as the sessionStorage-backed parent gate (lib/parent-lock).
  it("a solved puzzle survives a full-document navigation (offline tab switch)", () => {
    store.getState().markUnlocked("a");

    // The next page-load: a fresh store over the same session persistence.
    const nextPage = createActiveKidStore(persistence);

    expect(nextPage.getState().unlockedKidIds.has("a")).toBe(true);
  });

  it("setActive's unlock also survives a full-document navigation", () => {
    store.getState().setActive(kid("b"));
    expect(persistence.readUnlockedKidIds().has("b")).toBe(true);
  });
});
