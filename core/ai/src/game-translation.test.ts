import { describe, expect, it } from "vitest";

import {
  buildGameTranslationPrompt,
  parseGeneratedTranslations,
} from "./game-translation";

const INPUT = {
  sourceLocale: "de",
  targetLocales: ["en"],
  strings: { "game.start": "Los geht's!", "score.label": "{count} Sterne" },
  title: "Raketen zählen",
  description: "Zähle die Raketen vor dem Start",
};

describe("buildGameTranslationPrompt", () => {
  it("carries the source content, targets, and the JSON contract", () => {
    const { system, prompt } = buildGameTranslationPrompt(INPUT);
    expect(system).toContain("JSON");
    expect(system).toContain("{param}");
    expect(prompt).toContain("Source language: de");
    expect(prompt).toContain("Raketen zählen");
    expect(prompt).toContain('"score.label"');
    expect(prompt).toContain("Translate into: en");
    expect(prompt).not.toContain("Listing only");
  });

  it("lists listing-only locales and allows a title in any language", () => {
    const { system, prompt } = buildGameTranslationPrompt({
      ...INPUT,
      listingOnlyLocales: ["de"],
    });
    expect(system).toContain("ANY language");
    expect(prompt).toContain("Listing only (title and description, no strings): de");
  });
});

describe("parseGeneratedTranslations", () => {
  const parseInput = { targetLocales: ["en"], sourceStrings: INPUT.strings };
  const valid = () => ({
    locales: {
      en: {
        title: "Counting Rockets",
        description: "Count the rockets before liftoff",
        strings: { "game.start": "Let's go!", "score.label": "{count} stars" },
      },
    },
  });

  it("accepts a complete result", () => {
    const parsed = parseGeneratedTranslations(valid(), parseInput);
    expect(parsed.en.title).toBe("Counting Rockets");
    expect(parsed.en.strings["score.label"]).toBe("{count} stars");
  });

  it("rejects a missing target locale", () => {
    expect(() => parseGeneratedTranslations({ locales: {} }, parseInput)).toThrow(
      /missing locale 'en'/,
    );
  });

  it("rejects a missing string key", () => {
    const result = valid();
    delete (result.locales.en.strings as Record<string, string>)["score.label"];
    expect(() => parseGeneratedTranslations(result, parseInput)).toThrow(
      /missing key 'score.label'/,
    );
  });

  it("rejects a dropped {param} placeholder", () => {
    const result = valid();
    result.locales.en.strings["score.label"] = "many stars";
    expect(() => parseGeneratedTranslations(result, parseInput)).toThrow(
      /dropped the \{count\} placeholder/,
    );
  });

  it("rejects markup in a value", () => {
    const result = valid();
    result.locales.en.strings["game.start"] = "<b>Go!</b>";
    expect(() => parseGeneratedTranslations(result, parseInput)).toThrow(/markup/);
  });

  it("rejects an empty title", () => {
    const result = valid();
    result.locales.en.title = "  ";
    expect(() => parseGeneratedTranslations(result, parseInput)).toThrow(/no title/);
  });

  it("accepts a listing-only locale without strings", () => {
    const raw = valid() as { locales: Record<string, unknown> };
    raw.locales.de = { title: "Raketen zählen", description: "Zähle die Raketen" };
    const result = parseGeneratedTranslations(raw, { ...parseInput, listingOnlyLocales: ["de"] });
    expect(result.de).toEqual({
      title: "Raketen zählen",
      description: "Zähle die Raketen",
      strings: {},
    });
    expect(result.en.strings["game.start"]).toBe("Let's go!");
  });

  it("rejects a missing listing-only locale", () => {
    expect(() =>
      parseGeneratedTranslations(valid(), { ...parseInput, listingOnlyLocales: ["de"] }),
    ).toThrow(/missing locale 'de'/);
  });
});
