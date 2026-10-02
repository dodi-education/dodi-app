import { afterEach, describe, expect, it, vi } from "vitest";
import { SUPPORTED_LOCALES } from "@dodi/intl/locales";

/**
 * Hermes ships no Intl.PluralRules, so every ICU plural message failed to
 * format in the app ("FORMATTING_ERROR: Intl.PluralRules is not available in
 * this environment", logged on a Pixel 10). The app's Intl polyfill must
 * install it, with plural data for every UI language.
 */
const original = Intl.PluralRules;

/** The other Intl APIs the app uses that Hermes (RN 0.86) lacks. */
const MORE_MISSING_IN_HERMES = ["ListFormat", "DisplayNames", "supportedValuesOf"] as const;
const intl = Intl as unknown as Record<string, unknown>;
const originals = Object.fromEntries(MORE_MISSING_IN_HERMES.map((name) => [name, intl[name]]));

function removeFromIntl(name: string): void {
  Object.defineProperty(Intl, name, { value: undefined, configurable: true, writable: true });
}

afterEach(() => {
  Object.defineProperty(Intl, "PluralRules", { value: original, configurable: true, writable: true });
  for (const name of MORE_MISSING_IN_HERMES) {
    Object.defineProperty(Intl, name, { value: originals[name], configurable: true, writable: true });
  }
  vi.resetModules();
});

describe("Intl polyfills", () => {
  it("install Intl.PluralRules for English and German when the runtime lacks it", async () => {
    Object.defineProperty(Intl, "PluralRules", { value: undefined, configurable: true, writable: true });

    await import("./intl-polyfills");

    expect(typeof Intl.PluralRules).toBe("function");
    expect(new Intl.PluralRules("en").select(1)).toBe("one");
    expect(new Intl.PluralRules("en").select(2)).toBe("other");
    expect(new Intl.PluralRules("de").select(1)).toBe("one");
    expect(new Intl.PluralRules("de").select(5)).toBe("other");
    expect(new Intl.PluralRules("en", { type: "ordinal" }).select(2)).toBe("two");
  });

  it("cover every UI language", async () => {
    Object.defineProperty(Intl, "PluralRules", { value: undefined, configurable: true, writable: true });
    for (const name of MORE_MISSING_IN_HERMES) removeFromIntl(name);

    await import("./intl-polyfills");

    const locales = [...SUPPORTED_LOCALES];
    expect(Intl.PluralRules.supportedLocalesOf(locales)).toEqual(locales);
    expect(Intl.ListFormat.supportedLocalesOf(locales)).toEqual(locales);
    expect(Intl.DisplayNames.supportedLocalesOf(locales)).toEqual(locales);
  });

  it("install Intl.ListFormat when the runtime lacks it", async () => {
    removeFromIntl("ListFormat");

    await import("./intl-polyfills");

    expect(typeof Intl.ListFormat).toBe("function");
    expect(new Intl.ListFormat("en", { type: "conjunction" }).format(["German", "French"])).toBe("German and French");
    expect(new Intl.ListFormat("de", { type: "conjunction" }).format(["Deutsch", "Englisch", "Französisch"])).toBe(
      "Deutsch, Englisch und Französisch",
    );
  });

  it("install Intl.DisplayNames when the runtime lacks it", async () => {
    removeFromIntl("DisplayNames");

    await import("./intl-polyfills");

    expect(typeof Intl.DisplayNames).toBe("function");
    expect(new Intl.DisplayNames(["en"], { type: "language" }).of("de")).toBe("German");
    expect(new Intl.DisplayNames(["de"], { type: "language" }).of("en")).toBe("Englisch");
  });

  it("install Intl.supportedValuesOf when the runtime lacks it", async () => {
    removeFromIntl("supportedValuesOf");

    await import("./intl-polyfills");

    expect(typeof Intl.supportedValuesOf).toBe("function");
    const zones = Intl.supportedValuesOf("timeZone");
    expect(zones).toContain("Europe/Vienna");
    expect(zones).toContain("America/New_York");
  });

  it("keep a native implementation that serves every UI language", async () => {
    const native = { PluralRules: Intl.PluralRules, ListFormat: Intl.ListFormat, DisplayNames: Intl.DisplayNames };

    await import("./intl-polyfills");

    expect(Intl.PluralRules).toBe(native.PluralRules);
    expect(Intl.ListFormat).toBe(native.ListFormat);
    expect(Intl.DisplayNames).toBe(native.DisplayNames);
  });
});
