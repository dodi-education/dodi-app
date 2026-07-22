import { describe, expect, it } from "vitest";

import { activeKidId, buildCrumbs } from "./build-crumbs";

/** Identity translator: crumb labels come back as their i18n keys. */
const t = (key: string) => key;

describe("buildCrumbs", () => {
  it("returns nothing outside the parent area", () => {
    expect(buildCrumbs("/kid/home", t)).toEqual([]);
    expect(buildCrumbs("/login", t)).toEqual([]);
    expect(buildCrumbs("/parent", t)).toEqual([]);
  });

  it("maps a single-level section to one non-link crumb", () => {
    expect(buildCrumbs("/parent/dashboard", t)).toEqual([
      { label: "nav.dashboard" },
    ]);
    expect(buildCrumbs("/parent/activities", t)).toEqual([
      { label: "nav.activities" },
    ]);
    expect(buildCrumbs("/parent/usage", t)).toEqual([{ label: "nav.usage" }]);
    expect(buildCrumbs("/parent/snapshots", t)).toEqual([
      { label: "nav.parentSnapshots" },
    ]);
  });

  it("links the section root and labels the leaf on the kids list/new pages", () => {
    expect(buildCrumbs("/parent/kids", t)).toEqual([
      { label: "nav.kids", href: "/parent/kids" },
    ]);
    expect(buildCrumbs("/parent/kids/new", t)).toEqual([
      { label: "nav.kids", href: "/parent/kids" },
      { label: "kids.addKid" },
    ]);
  });

  it("resolves the kid name and marks the kid crumb switchable", () => {
    expect(buildCrumbs("/parent/kids/abc", t, { kidName: "Lea" })).toEqual([
      { label: "nav.kids", href: "/parent/kids" },
      { label: "Lea", href: "/parent/kids/abc", isKidCrumb: true },
    ]);
  });

  it("appends the memory leaf and keeps the kid crumb switchable", () => {
    expect(
      buildCrumbs("/parent/kids/abc/memory", t, { kidName: "Lea" }),
    ).toEqual([
      { label: "nav.kids", href: "/parent/kids" },
      { label: "Lea", href: "/parent/kids/abc", isKidCrumb: true },
      { label: "breadcrumbs.memory" },
    ]);
  });

  it("falls back to a placeholder when the kid name isn't loaded yet", () => {
    const crumbs = buildCrumbs("/parent/kids/abc", t);
    expect(crumbs[1]).toEqual({
      label: "…",
      href: "/parent/kids/abc",
      isKidCrumb: true,
    });
  });

  it("handles personas (name + new)", () => {
    expect(
      buildCrumbs("/parent/personas/xyz", t, { leafOverride: "Explorer" }),
    ).toEqual([
      { label: "nav.personas", href: "/parent/personas" },
      { label: "Explorer" },
    ]);
    expect(buildCrumbs("/parent/personas/new", t)).toEqual([
      { label: "nav.personas", href: "/parent/personas" },
      { label: "breadcrumbs.newPersona" },
    ]);
  });

  it("roots the studio at the games list and prefers the live leaf override", () => {
    expect(buildCrumbs("/parent/game-studio/new", t)).toEqual([
      { label: "nav.gameStudio", href: "/parent/games" },
      { label: "gameStudio.addGame" },
    ]);
    expect(buildCrumbs("/parent/game-studio/gid", t)).toEqual([
      { label: "nav.gameStudio", href: "/parent/games" },
      { label: "gameStudio.editing" },
    ]);
    expect(
      buildCrumbs("/parent/game-studio/gid", t, {
        leafOverride: "My counting game",
      }),
    ).toEqual([
      { label: "nav.gameStudio", href: "/parent/games" },
      { label: "My counting game" },
    ]);
  });

  it("maps the games list and the published-game preview under /parent/games", () => {
    expect(buildCrumbs("/parent/games", t)).toEqual([
      { label: "nav.gameStudio", href: "/parent/games" },
    ]);
    expect(buildCrumbs("/parent/games/gid", t)).toEqual([
      { label: "nav.gameStudio", href: "/parent/games" },
      { label: "gameStudio.preview" },
    ]);
    expect(
      buildCrumbs("/parent/games/gid", t, { leafOverride: "My counting game" }),
    ).toEqual([
      { label: "nav.gameStudio", href: "/parent/games" },
      { label: "My counting game" },
    ]);
  });

  it("labels settings sub-sections and ignores unknown ones", () => {
    expect(buildCrumbs("/parent/settings/security", t)).toEqual([
      { label: "nav.settings", href: "/parent/settings/general" },
      { label: "settings.navSecurity" },
    ]);
    expect(buildCrumbs("/parent/settings", t)).toEqual([
      { label: "nav.settings", href: "/parent/settings/general" },
    ]);
    expect(buildCrumbs("/parent/settings/bogus", t)).toEqual([
      { label: "nav.settings", href: "/parent/settings/general" },
    ]);
  });

  it("tolerates a trailing slash", () => {
    expect(buildCrumbs("/parent/kids/", t)).toEqual([
      { label: "nav.kids", href: "/parent/kids" },
    ]);
  });
});

describe("activeKidId", () => {
  it("extracts the id from kid-scoped routes", () => {
    expect(activeKidId("/parent/kids/abc")).toBe("abc");
    expect(activeKidId("/parent/kids/abc/memory")).toBe("abc");
  });

  it("returns null for non-kid or list/new routes", () => {
    expect(activeKidId("/parent/kids")).toBeNull();
    expect(activeKidId("/parent/kids/new")).toBeNull();
    expect(activeKidId("/parent/personas/abc")).toBeNull();
  });
});
