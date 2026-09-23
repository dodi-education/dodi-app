import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Game } from "@dodi/types/database";

const generateJson = vi.fn();

vi.mock("@/lib/ai/resolve-client-thinking", () => ({
  resolveClientThinking: vi.fn(async () => ({ provider: "anthropic", apiKey: "k", model: "m" })),
}));
vi.mock("@dodi/ai/client-thinking", () => ({
  createClientThinkingProvider: vi.fn(() => ({ generateJson })),
}));
vi.mock("@/lib/usage/report-usage", () => ({ reportUsage: vi.fn() }));

import { translateGameForPublication } from "./client-translate-game";

// Covers every platform locale, so no strings need translating.
const BUNDLE =
  '<html><head><script type="application/dodi-translations">' +
  '{"sourceLocale":"de","locales":{"de":{"go":"Los!"},"en":{"go":"Go!"}}}' +
  "</script></head><body>hi</body></html>";

// Name and description written in the parent's language (English), while the
// game itself (the child's language) is German.
const GAME = {
  id: "game-1",
  title: "Letter Maze",
  description: "Draw a golden path",
  code_bundle: BUNDLE,
} as Game;

const EN = { title: "Letter Maze", description: "Draw a golden path" };
const DE = { title: "Buchstaben-Labyrinth", description: "Zeichne einen goldenen Weg" };

describe("translateGameForPublication", () => {
  beforeEach(() => {
    generateJson.mockReset();
  });

  it("generates the game-language listing instead of copying the game's name", async () => {
    generateJson.mockResolvedValue({ locales: { de: DE } });

    const result = await translateGameForPublication(GAME, { knownListings: { en: EN } });

    expect(result.sourceLocale).toBe("de");
    expect(result.translations).toEqual({ de: DE, en: EN });
    const prompt = generateJson.mock.calls[0][1] as string;
    expect(prompt).toContain("Listing only (title and description, no strings): de");
  });

  it("keeps a game-language listing the parent already fixed, without an AI call", async () => {
    const result = await translateGameForPublication(GAME, {
      knownListings: { en: EN, de: DE },
    });

    expect(result.translations).toEqual({ de: DE, en: EN });
    expect(generateJson).not.toHaveBeenCalled();
  });

  it("regenerates the game-language listing when its known title was cleared", async () => {
    generateJson.mockResolvedValue({ locales: { de: DE } });

    const result = await translateGameForPublication(GAME, {
      knownListings: { en: EN, de: { title: " ", description: "x" } },
    });

    expect(result.translations.de).toEqual(DE);
  });
});
