import { describe, expect, it } from "vitest";

import {
  isUuidLike,
  resolveLaunchGameTarget,
  titleLookupKeys,
} from "./resolve-launch-game";

const MAZE = { id: "af7e848c-faa8-490c-bd38-3fdbafe1216c", title: "Buchstabenlabyrinth" };
const COUNT = { id: "1b2c3d4e-0000-4000-8000-000000000001", title: "Zählen mit Tieren" };
const COUNT_TWIN = { id: "1b2c3d4e-0000-4000-8000-000000000002", title: "Zählen mit Tieren" };
const CATALOG = [MAZE, COUNT];

describe("resolveLaunchGameTarget", () => {
  it("matches an exact catalog id (case-insensitively)", () => {
    expect(resolveLaunchGameTarget(MAZE.id, CATALOG)).toEqual({ kind: "game", id: MAZE.id });
    expect(resolveLaunchGameTarget(MAZE.id.toUpperCase(), CATALOG)).toEqual({
      kind: "game",
      id: MAZE.id,
    });
  });

  it("maps a lowercased title used as the id back to the catalog id", () => {
    expect(resolveLaunchGameTarget("buchstabenlabyrinth", CATALOG)).toEqual({
      kind: "game",
      id: MAZE.id,
    });
  });

  it("matches titles loosely across slugs, umlaut folding and punctuation", () => {
    for (const variant of [
      "zaehlen-mit-tieren",
      "zahlen_mit_tieren",
      "Zählen mit Tieren!",
      "  ZÄHLEN MIT TIEREN ",
    ]) {
      expect(resolveLaunchGameTarget(variant, CATALOG)).toEqual({
        kind: "game",
        id: COUNT.id,
      });
    }
  });

  it("reports several same-titled games as ambiguous rather than picking one", () => {
    expect(resolveLaunchGameTarget("zählen mit tieren", [...CATALOG, COUNT_TWIN])).toEqual({
      kind: "ambiguous",
      query: "zählen mit tieren",
    });
  });

  it("reports unknown for anything the catalog does not contain", () => {
    expect(resolveLaunchGameTarget("raketenrechnen", CATALOG)).toEqual({ kind: "unknown" });
    expect(resolveLaunchGameTarget("", CATALOG)).toEqual({ kind: "unknown" });
    expect(resolveLaunchGameTarget("---", CATALOG)).toEqual({ kind: "unknown" });
    expect(resolveLaunchGameTarget(MAZE.id, [])).toEqual({ kind: "unknown" });
  });

  it("never matches a title by prefix or substring", () => {
    expect(resolveLaunchGameTarget("buchstaben", CATALOG)).toEqual({ kind: "unknown" });
  });
});

describe("titleLookupKeys", () => {
  it("yields both umlaut foldings", () => {
    expect(titleLookupKeys("Zählen")).toEqual(
      expect.arrayContaining(["zahlen", "zaehlen"]),
    );
  });
});

describe("isUuidLike", () => {
  it("accepts UUIDs and rejects slugs", () => {
    expect(isUuidLike(MAZE.id)).toBe(true);
    expect(isUuidLike("buchstabenlabyrinth")).toBe(false);
  });
});
