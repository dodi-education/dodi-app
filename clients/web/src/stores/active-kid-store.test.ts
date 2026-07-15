import { beforeEach, describe, expect, it } from "vitest";

import { useActiveKidStore } from "./active-kid-store";
import type { Kid } from "@dodi/types/database";

function kid(id: string, extra: Partial<Kid> = {}): Kid {
  return { id, avatar_pin: null, language: "en", ...extra } as Kid;
}

// A fresh store per test models a fresh page-load (no in-memory unlocks).
beforeEach(() => {
  useActiveKidStore.setState({ activeKidId: null, unlockedKidIds: new Set() });
});

describe("resolve", () => {
  // In node there is no document.cookie, so resolve() sees no active-kid cookie —
  // exactly the cold "/" entry that used to leave the home page on "No kid
  // selected". It must select the first available profile.
  it("selects the first available profile on a cold entry", () => {
    useActiveKidStore.getState().resolve([kid("first"), kid("second")]);
    expect(useActiveKidStore.getState().activeKidId).toBe("first");
  });

  it("resolves to null for an account with no kids", () => {
    useActiveKidStore.getState().resolve([]);
    expect(useActiveKidStore.getState().activeKidId).toBeNull();
  });

  it("is stable when re-resolved against the same list", () => {
    const { resolve } = useActiveKidStore.getState();
    resolve([kid("a"), kid("b")]);
    const first = useActiveKidStore.getState().activeKidId;
    resolve([kid("a"), kid("b")]);
    expect(useActiveKidStore.getState().activeKidId).toBe(first);
  });
});

describe("unlock lifecycle", () => {
  it("starts with nothing unlocked (a hard refresh re-prompts)", () => {
    expect(useActiveKidStore.getState().unlockedKidIds.size).toBe(0);
  });

  it("markUnlocked records a solved profile for this page-load", () => {
    useActiveKidStore.getState().markUnlocked("a");
    expect(useActiveKidStore.getState().unlockedKidIds.has("a")).toBe(true);
  });

  it("setActive switches the active kid and unlocks it", () => {
    useActiveKidStore.getState().setActive(kid("b"));
    const state = useActiveKidStore.getState();
    expect(state.activeKidId).toBe("b");
    expect(state.unlockedKidIds.has("b")).toBe(true);
  });

  it("markUnlocked returns a new Set reference so subscribers re-render", () => {
    const before = useActiveKidStore.getState().unlockedKidIds;
    useActiveKidStore.getState().markUnlocked("a");
    expect(useActiveKidStore.getState().unlockedKidIds).not.toBe(before);
  });
});
