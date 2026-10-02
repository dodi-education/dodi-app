import { describe, expect, it } from "vitest";

import {
  findSameDescriptionGroups,
  flaggedListingLocales,
  languageDisplayName,
  sortListingLocales,
} from "./listing-checks";

describe("findSameDescriptionGroups", () => {
  it("flags locales sharing a description (the untranslated listing case)", () => {
    expect(
      findSameDescriptionGroups({
        en: { title: "Letter Maze", description: "Draw a golden path." },
        de: { title: "Letter Maze", description: "  draw a golden   PATH. " },
      }),
    ).toEqual([["de", "en"]]);
  });

  it("ignores identical titles with translated descriptions", () => {
    expect(
      findSameDescriptionGroups({
        en: { title: "Pixel Pong", description: "Bounce the ball." },
        de: { title: "Pixel Pong", description: "Lass den Ball springen." },
      }),
    ).toEqual([]);
  });

  it("ignores empty descriptions", () => {
    expect(
      findSameDescriptionGroups({
        en: { title: "A", description: "" },
        de: { title: "B", description: " " },
      }),
    ).toEqual([]);
  });
});

describe("languageDisplayName", () => {
  it("names a locale in the UI language", () => {
    expect(languageDisplayName("de", "en")).toBe("German");
    expect(languageDisplayName("en", "de")).toBe("Englisch");
  });
});

describe("sortListingLocales", () => {
  it("puts the game language first, then the rest alphabetically", () => {
    const entry = { title: "t", description: "d" };
    expect(sortListingLocales({ fr: entry, en: entry, de: entry }, "fr")).toEqual(["fr", "de", "en"]);
    expect(sortListingLocales({ fr: entry, en: entry }, null)).toEqual(["en", "fr"]);
  });

  it("flags every locale of a same-text group", () => {
    const same = { title: "x", description: "Same." };
    expect(flaggedListingLocales({ en: same, de: same, fr: { title: "y", description: "Autre." } })).toEqual(
      new Set(["de", "en"]),
    );
  });
});
