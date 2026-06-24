import { describe, expect, it } from "vitest";

import { resolveLocale, type LocaleSignals } from "./resolve-locale";

function signals(overrides: Partial<LocaleSignals> = {}): LocaleSignals {
  return {
    pathname: null,
    view: undefined,
    kidLocale: undefined,
    userLocale: undefined,
    acceptLanguage: null,
    ...overrides,
  };
}

describe("resolveLocale", () => {
  it("uses the kid profile language while in kid view", () => {
    expect(
      resolveLocale(
        signals({ pathname: "/home", view: "kid", kidLocale: "de" }),
      ),
    ).toBe("de");
  });

  it("honors the parent's NEXT_LOCALE on /parent routes even when kid cookies are stale", () => {
    // Reproduces the reported bug: a leftover `dodi-view=kid` cookie (from
    // visiting Kid View) shadowed the parent's language choice on /parent pages.
    expect(
      resolveLocale(
        signals({
          pathname: "/parent/settings",
          view: "kid",
          kidLocale: "de",
          userLocale: "en",
        }),
      ),
    ).toBe("en");
  });

  it("honors NEXT_LOCALE when no kid view is active", () => {
    expect(
      resolveLocale(
        signals({ pathname: "/parent/dashboard", userLocale: "de" }),
      ),
    ).toBe("de");
  });

  it("falls back to Accept-Language when no cookie preference is set", () => {
    expect(
      resolveLocale(
        signals({ pathname: "/parent/dashboard", acceptLanguage: "de-DE,de;q=0.9,en;q=0.8" }),
      ),
    ).toBe("de");
  });

  it("falls back to the default locale when nothing matches", () => {
    expect(resolveLocale(signals({ pathname: "/parent/dashboard" }))).toBe("en");
  });

  it("ignores unsupported locale cookie values", () => {
    expect(
      resolveLocale(signals({ pathname: "/parent/dashboard", userLocale: "fr" })),
    ).toBe("en");
  });
});
