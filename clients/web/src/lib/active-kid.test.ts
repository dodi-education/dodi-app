import { describe, expect, it } from "vitest";

import { computeNeedsPin, pickActiveKidId } from "./active-kid";
import type { Kid } from "@dodi/types/database";

function kid(id: string, extra: Partial<Kid> = {}): Kid {
  return { id, avatar_pin: null, language: "en", ...extra } as Kid;
}

describe("pickActiveKidId", () => {
  it("keeps the cookie's kid while it still exists", () => {
    expect(pickActiveKidId([kid("a"), kid("b")], "b")).toBe("b");
  });

  it("falls back to the first (oldest) kid when the cookie is empty — the cold '/' entry", () => {
    expect(pickActiveKidId([kid("a"), kid("b")], null)).toBe("a");
  });

  it("falls back to the first kid when the cookie points to a deleted kid", () => {
    expect(pickActiveKidId([kid("a"), kid("b")], "gone")).toBe("a");
  });

  it("returns null only when the account has no kids", () => {
    expect(pickActiveKidId([], null)).toBeNull();
  });
});

describe("computeNeedsPin", () => {
  const locked = kid("a", { avatar_pin: '["cat","dog","fox"]' });

  it("is false for a profile without a puzzle", () => {
    expect(computeNeedsPin(kid("a"), new Set())).toBe(false);
  });

  it("is true for a locked profile not yet unlocked this page-load", () => {
    expect(computeNeedsPin(locked, new Set())).toBe(true);
  });

  it("is false once the profile has been unlocked this page-load", () => {
    expect(computeNeedsPin(locked, new Set(["a"]))).toBe(false);
  });

  it("is false when there is no active profile", () => {
    expect(computeNeedsPin(null, new Set())).toBe(false);
  });
});
