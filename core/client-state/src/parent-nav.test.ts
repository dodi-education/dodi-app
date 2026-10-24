import { describe, expect, it } from "vitest";

import {
  canUseKidView,
  isParentPathAllowed,
  parentHomeFor,
  parentNavFor,
  settingsNavFor,
} from "./parent-nav";

const OWNER = { role: "owner" as const, scopes: [] };
const SITTER = { role: "member" as const, scopes: ["games"] };
const VIEWER = { role: "member" as const, scopes: ["kids:basic"] };

describe("what the parent area shows each person", () => {
  it("lists the account's settings with General first and Access right below", () => {
    expect(settingsNavFor(OWNER).map((i) => i.href)).toEqual([
      "/parent/settings/general",
      "/parent/settings/access",
      "/parent/settings/notifications",
      "/parent/settings/security",
      "/parent/settings/ai-providers",
      "/parent/settings/game-studio",
    ]);
  });

  it("shows the owner and co-parents everything", () => {
    expect(parentNavFor(OWNER).flatMap((g) => g.items).length).toBeGreaterThan(5);
    expect(isParentPathAllowed("/parent/kids/abc", OWNER)).toBe(true);
    expect(canUseKidView({ role: "co_parent", scopes: [] })).toBe(true);
  });

  it("shows a scoped member only what they were granted", () => {
    expect(parentNavFor(SITTER).flatMap((g) => g.items.map((i) => i.href))).toEqual(["/parent/games"]);
    expect(settingsNavFor(SITTER).map((i) => i.href)).toEqual([
      "/parent/settings/general",
      "/parent/settings/access",
      "/parent/settings/notifications",
    ]);
    expect(isParentPathAllowed("/parent/profile", SITTER)).toBe(true);
    expect(isParentPathAllowed("/parent/settings/security", SITTER)).toBe(false);
    expect(isParentPathAllowed("/parent/game-studio/123/code", SITTER)).toBe(true);
    expect(isParentPathAllowed("/parent/kids", SITTER)).toBe(false);
    expect(isParentPathAllowed("/parent/settings/ai-providers", SITTER)).toBe(false);
    expect(isParentPathAllowed("/parent/authorize", SITTER)).toBe(false);
    expect(isParentPathAllowed("/parent/settings", SITTER)).toBe(true);
    expect(canUseKidView(SITTER)).toBe(false);
  });

  it("lands each person on a page they may open", () => {
    expect(parentHomeFor(OWNER)).toBe("/parent/dashboard");
    expect(parentHomeFor(SITTER)).toBe("/parent/games");
    expect(parentHomeFor(VIEWER)).toBe("/parent/settings/general");
  });

  it("does not hide anything before the role is known", () => {
    expect(isParentPathAllowed("/parent/kids", { role: null, scopes: [] })).toBe(true);
  });
});
