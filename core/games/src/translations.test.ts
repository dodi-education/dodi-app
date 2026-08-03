import { describe, expect, it } from "vitest";

import {
  MAX_TRANSLATION_KEYS_PER_LOCALE,
  codeWithoutTranslationsBlock,
  coverageGaps,
  coveredLocales,
  extractTranslations,
  hasTranslationsBlock,
  replaceTranslationsBlock,
  serializeTranslations,
  stripTranslationsToSource,
  translateCallKeys,
  type GameTranslations,
} from "./translations";

const SAMPLE: GameTranslations = {
  sourceLocale: "de",
  locales: {
    de: { "game.start": "Los geht's!", "game.score": "{count} Sterne" },
    en: { "game.start": "Let's go!", "game.score": "{count} stars" },
  },
};

function bundleWith(block: string): string {
  return `<!doctype html><html><head>${block}</head><body><script>init();</script></body></html>`;
}

describe("extractTranslations", () => {
  it("returns null without error for a bundle without a block (legacy)", () => {
    const result = extractTranslations("<html><body><script>x()</script></body></html>");
    expect(result.translations).toBeNull();
    expect(result.errors).toEqual([]);
  });

  it("round-trips a serialized block", () => {
    const code = bundleWith(serializeTranslations(SAMPLE));
    const result = extractTranslations(code);
    expect(result.errors).toEqual([]);
    expect(result.translations).toEqual(SAMPLE);
  });

  it("matches a block with extra attributes and single quotes", () => {
    const block = `<script type='application/dodi-translations' id="i18n">${JSON.stringify(SAMPLE)}</script>`;
    expect(extractTranslations(bundleWith(block)).translations).toEqual(SAMPLE);
  });

  it("rejects multiple blocks", () => {
    const one = serializeTranslations(SAMPLE);
    const result = extractTranslations(bundleWith(one + one));
    expect(result.translations).toBeNull();
    expect(result.errors[0]).toMatch(/exactly one/);
  });

  it("rejects invalid JSON", () => {
    const result = extractTranslations(
      bundleWith(`<script type="application/dodi-translations">{nope</script>`),
    );
    expect(result.translations).toBeNull();
    expect(result.errors[0]).toMatch(/not valid JSON/);
  });

  it("rejects a sourceLocale missing from locales", () => {
    const bad = { sourceLocale: "fr", locales: { de: {} } };
    const result = extractTranslations(
      bundleWith(`<script type="application/dodi-translations">${JSON.stringify(bad)}</script>`),
    );
    expect(result.translations).toBeNull();
    expect(result.errors[0]).toMatch(/malformed/);
  });

  it.each([
    ["markup in value", { "k": "<b>hi</b>" }],
    ["script-close in value", { "k": "</script><script>evil()" }],
    ["control char in value", { "k": "a\u0000b" }],
    ["bad key characters", { "bad key!": "hi" }],
  ])("rejects %s", (_label, dict) => {
    const bad = { sourceLocale: "de", locales: { de: dict } };
    const result = extractTranslations(
      bundleWith(`<script type="application/dodi-translations">${JSON.stringify(bad)}</script>`),
    );
    expect(result.translations).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("accepts a story-length value with paragraph breaks", () => {
    const story = ("Es war einmal ein kleiner Drache.\n\n" + "Er flog weit. ".repeat(150)).trim();
    expect(story.length).toBeGreaterThan(2000);
    const block = {
      sourceLocale: "de",
      locales: { de: { "story.1": story } },
    };
    const result = extractTranslations(
      bundleWith(`<script type="application/dodi-translations">${JSON.stringify(block)}</script>`),
    );
    expect(result.errors).toEqual([]);
    expect(result.translations?.locales.de["story.1"]).toBe(story);
  });

  it("rejects a locale dict over the key cap", () => {
    const dict: Record<string, string> = {};
    for (let i = 0; i <= MAX_TRANSLATION_KEYS_PER_LOCALE; i++) dict[`k${i}`] = "v";
    const bad = { sourceLocale: "de", locales: { de: dict } };
    const result = extractTranslations(
      bundleWith(`<script type="application/dodi-translations">${JSON.stringify(bad)}</script>`),
    );
    expect(result.translations).toBeNull();
    expect(result.errors[0]).toMatch(/maximum/);
  });
});

describe("hasTranslationsBlock", () => {
  it("detects presence and absence", () => {
    expect(hasTranslationsBlock(bundleWith(serializeTranslations(SAMPLE)))).toBe(true);
    expect(hasTranslationsBlock("<html></html>")).toBe(false);
  });
});

describe("replaceTranslationsBlock", () => {
  it("preserves every byte outside the block", () => {
    const code = bundleWith(serializeTranslations(SAMPLE));
    const updated = replaceTranslationsBlock(code, {
      ...SAMPLE,
      locales: { ...SAMPLE.locales, fr: { "game.start": "C'est parti!" } },
    });
    expect(codeWithoutTranslationsBlock(updated)).toBe(codeWithoutTranslationsBlock(code));
    expect(extractTranslations(updated).translations?.locales.fr).toEqual({
      "game.start": "C'est parti!",
    });
  });

  it("throws when the bundle has no block", () => {
    expect(() => replaceTranslationsBlock("<html></html>", SAMPLE)).toThrow(/exactly one/);
  });
});

describe("stripTranslationsToSource", () => {
  it("drops every non-source locale", () => {
    const code = bundleWith(serializeTranslations(SAMPLE));
    const stripped = stripTranslationsToSource(code);
    const result = extractTranslations(stripped);
    expect(Object.keys(result.translations?.locales ?? {})).toEqual(["de"]);
    expect(result.translations?.locales.de).toEqual(SAMPLE.locales.de);
  });

  it("is idempotent and passes legacy bundles through unchanged", () => {
    const code = bundleWith(serializeTranslations(SAMPLE));
    const once = stripTranslationsToSource(code);
    expect(stripTranslationsToSource(once)).toBe(once);
    const legacy = "<html><body>hi</body></html>";
    expect(stripTranslationsToSource(legacy)).toBe(legacy);
  });
});

describe("translateCallKeys", () => {
  it("collects unique literal keys from both quote styles", () => {
    const code = `
      el.textContent = dodi.translate("game.start");
      ctx.fillText(dodi.translate('game.score', {count: n}), 10, 10);
      other.textContent = dodi.translate("game.start");
    `;
    expect(translateCallKeys(code).sort()).toEqual(["game.score", "game.start"]);
  });

  it("ignores computed keys", () => {
    expect(translateCallKeys(`dodi.translate(key)`)).toEqual([]);
  });
});

describe("coveredLocales", () => {
  it("covers the source by definition and full dicts by exact or short code", () => {
    const covered = coveredLocales(
      {
        sourceLocale: "de",
        locales: {
          de: { a: "1" },
          "en-gb": { a: "one" },
          fr: {},
        },
      },
      ["de", "en", "fr", "es"],
    );
    expect([...covered].sort()).toEqual(["de", "en"]);
  });

  it("excludes locales with coverage gaps", () => {
    const covered = coveredLocales(
      {
        sourceLocale: "de",
        locales: { de: { a: "1", b: "2" }, en: { a: "one" } },
      },
      ["de", "en"],
    );
    expect([...covered]).toEqual(["de"]);
  });
});

describe("coverageGaps", () => {
  it("is empty when every locale covers the source keys", () => {
    expect(coverageGaps(SAMPLE)).toEqual({});
  });

  it("reports missing keys per locale", () => {
    const gaps = coverageGaps({
      sourceLocale: "de",
      locales: {
        de: { a: "1", b: "2" },
        en: { a: "one" },
      },
    });
    expect(gaps).toEqual({ en: ["b"] });
  });
});

describe("serializeTranslations", () => {
  it("escapes '<' so the block can never be terminated early", () => {
    expect(serializeTranslations(SAMPLE)).not.toMatch(/<(?!\/?script)/);
  });
});
