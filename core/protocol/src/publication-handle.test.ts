import { describe, expect, it } from "vitest";

import {
  PUBLICATION_HANDLE_RE,
  isValidPublicationHandle,
  normalizePublicationHandle,
  publicationHandleError,
} from "./publication-handle";

describe("publication handle", () => {
  it("accepts lowercase letters, digits and underscores", () => {
    for (const handle of ["fun_games", "abc", "a_1", "x".repeat(30), "game_lab_7"]) {
      expect(isValidPublicationHandle(handle)).toBe(true);
    }
  });

  it("rejects spaces, punctuation, uppercase and out-of-range lengths", () => {
    for (const handle of [
      "fun games",
      "fun-games",
      "fun.games",
      "fun@games",
      "FunGames",
      "ab",
      "x".repeat(31),
      "",
    ]) {
      expect(isValidPublicationHandle(handle)).toBe(false);
      expect(publicationHandleError(handle)).toBe("format");
    }
  });

  it("rejects handles that would impersonate dodi or staff", () => {
    for (const handle of ["dodi", "admin", "support", "official", "system"]) {
      expect(isValidPublicationHandle(handle)).toBe(false);
      expect(publicationHandleError(handle)).toBe("reserved");
    }
  });

  it("normalizes typed input to the canonical stored form", () => {
    expect(normalizePublicationHandle("  Fun_Games  ")).toBe("fun_games");
    expect(isValidPublicationHandle(normalizePublicationHandle(" FUN_GAMES "))).toBe(
      true,
    );
    // Normalizing cannot rescue an illegal character set.
    expect(isValidPublicationHandle(normalizePublicationHandle("Fun Games!"))).toBe(
      false,
    );
  });

  it("keeps the regex in step with the DB CHECK constraint", () => {
    expect(PUBLICATION_HANDLE_RE.source).toBe("^[a-z0-9_]{3,30}$");
  });

  it("returns null for a valid handle", () => {
    expect(publicationHandleError("fun_games")).toBeNull();
  });
});
