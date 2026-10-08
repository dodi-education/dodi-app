import { describe, expect, it } from "vitest";

import { siteUrl } from "./site-links";

describe("siteUrl", () => {
  it("links the BYOK help article per locale", () => {
    expect(siteUrl("byok", "en")).toBe(
      "https://www.dodi.app/blog/how-does-byok-work",
    );
    expect(siteUrl("byok", "de")).toBe(
      "https://www.dodi.app/de/blog/wie-funktioniert-byok",
    );
  });

  it("links the legal pages per locale", () => {
    expect(siteUrl("privacy", "en")).toBe("https://www.dodi.app/privacy");
    expect(siteUrl("terms", "de")).toBe("https://www.dodi.app/de/nutzungsbedingungen");
  });

  it("falls back to the English path for an unknown locale", () => {
    expect(siteUrl("byok", "fr")).toBe(
      "https://www.dodi.app/blog/how-does-byok-work",
    );
  });
});
