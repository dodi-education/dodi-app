import { describe, expect, it } from "vitest";

import { AGENT_LIMITS } from "./game-agent";

describe("AGENT_LIMITS", () => {
  it("bounds output tokens and retries to the priced worst-case", () => {
    // These values back the pricing model's per-game worst-case ceiling; a
    // regression here silently widens cost risk, so pin them exactly.
    expect(AGENT_LIMITS).toEqual({
      MAX_AGENT_TURNS: 15,
      MAX_VALIDATION_RETRIES: 1,
      MAX_TOKENS: 8000,
    });
  });
});
