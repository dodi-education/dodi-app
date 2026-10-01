import { describe, expect, it } from "vitest";

import { SUPPORTED_LOCALES } from "./locales";
import { loadMessages } from "./messages";

/** Every leaf key path of a catalog, e.g. "gameStudio.resumeBuild". */
function keyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    keyPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("message catalogs", () => {
  it("every locale carries exactly the source catalog's keys", async () => {
    const source = keyPaths(await loadMessages("en")).sort();
    for (const locale of SUPPORTED_LOCALES) {
      const keys = keyPaths(await loadMessages(locale)).sort();
      expect({ locale, missing: source.filter((k) => !keys.includes(k)) }).toEqual({
        locale,
        missing: [],
      });
      expect({ locale, extra: keys.filter((k) => !source.includes(k)) }).toEqual({
        locale,
        extra: [],
      });
    }
  });
});
