import { describe, expect, it } from "vitest";

import { legalUrl } from "./legal-links";

describe("legalUrl", () => {
  it("links the page in the app's locale", () => {
    expect(legalUrl("https://www.dodi.app", "privacy", "en")).toBe("https://www.dodi.app/privacy");
    expect(legalUrl("https://www.dodi.app", "privacy", "de")).toBe("https://www.dodi.app/de/datenschutz");
    expect(legalUrl("https://www.dodi.app", "deleteAccount", "de")).toBe(
      "https://www.dodi.app/de/konto-loeschen",
    );
  });

  it("falls back to English and tolerates a trailing slash on the origin", () => {
    expect(legalUrl("https://www.dodi.app/", "terms", "fr")).toBe("https://www.dodi.app/terms");
  });
});
