import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { renderTokensCss } from "./css";

describe("tokens.css", () => {
  it("matches src/tokens.ts (run `pnpm --filter @dodi/design-tokens build:css`)", () => {
    const committed = readFileSync(new URL("../tokens.css", import.meta.url), "utf8");
    expect(committed).toBe(renderTokensCss());
  });
});
