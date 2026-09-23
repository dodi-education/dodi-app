import { describe, expect, it } from "vitest";

import { findSameDescriptionGroups, languageDisplayName } from "./listing-checks";

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
