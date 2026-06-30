import { describe, expect, it } from "vitest";

import { defaultPref, resolvePref } from "./prefs";

describe("defaultPref", () => {
  it("account context → numeric (short)", () => {
    expect(defaultPref("en", "account").dateStyle).toBe("numeric");
    expect(defaultPref("de", "account").dateStyle).toBe("numeric");
  });

  it("kid context → long", () => {
    expect(defaultPref("en", "kid").dateStyle).toBe("long");
    expect(defaultPref("de", "kid").dateStyle).toBe("long");
  });

  it("time style follows locale (DE 24h, EN 12h)", () => {
    expect(defaultPref("de", "account").timeStyle).toBe("24h");
    expect(defaultPref("en", "account").timeStyle).toBe("12h");
  });

  it("timezone defaults to auto", () => {
    expect(defaultPref("en", "kid").timeZone).toBe("auto");
  });
});

describe("resolvePref", () => {
  it("nothing set → context default", () => {
    expect(resolvePref("en", "account").dateStyle).toBe("numeric");
    expect(resolvePref("en", "kid").dateStyle).toBe("long");
  });

  it("account overrides the default", () => {
    expect(resolvePref("en", "account", { dateStyle: "long" }).dateStyle).toBe("long");
  });

  it("kid overrides account, per field", () => {
    const r = resolvePref(
      "en",
      "kid",
      { dateStyle: "numeric", timeStyle: "24h", timeZone: "Europe/Berlin" },
      { timeZone: "America/New_York" }, // override only the zone
    );
    expect(r.timeZone).toBe("America/New_York"); // kid wins
    expect(r.dateStyle).toBe("numeric"); // inherited from account
    expect(r.timeStyle).toBe("24h"); // inherited from account
  });
});
