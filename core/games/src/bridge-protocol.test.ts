import { describe, expect, it } from "vitest";

import {
  GameToParentMessageSchema,
  ParentToGameMessageSchema,
  createBridgeToken,
} from "./bridge-protocol";

const token = createBridgeToken();
const gameId = "0b9f2f1e-4c1d-4b6e-9a2e-1f2d3c4b5a69";

describe("save-state bridge messages", () => {
  it("parses dodi:get_save_state", () => {
    const parsed = ParentToGameMessageSchema.safeParse({
      type: "dodi:get_save_state",
      token,
    });
    expect(parsed.success).toBe(true);
  });

  it("parses dodi:init with a savedState payload", () => {
    const parsed = ParentToGameMessageSchema.safeParse({
      type: "dodi:init",
      token,
      payload: {
        gameId,
        savedState: { canvasPng: "data:image/png;base64,AAA", brushSize: 4 },
      },
    });
    expect(parsed.success).toBe(true);
  });

  it("still parses dodi:init without savedState", () => {
    const parsed = ParentToGameMessageSchema.safeParse({
      type: "dodi:init",
      token,
      payload: { gameId },
    });
    expect(parsed.success).toBe(true);
  });

  it("parses game:save_state with a nested state object", () => {
    const parsed = GameToParentMessageSchema.safeParse({
      type: "game:save_state",
      token,
      payload: { state: { score: 3, items: ["a", "b"], grid: { rows: 2 } } },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects game:save_state without a state object", () => {
    expect(
      GameToParentMessageSchema.safeParse({
        type: "game:save_state",
        token,
        payload: {},
      }).success,
    ).toBe(false);
    expect(
      GameToParentMessageSchema.safeParse({
        type: "game:save_state",
        token,
        payload: { state: "not-an-object" },
      }).success,
    ).toBe(false);
  });

  it("rejects a bad token on the new messages", () => {
    expect(
      ParentToGameMessageSchema.safeParse({
        type: "dodi:get_save_state",
        token: "short",
      }).success,
    ).toBe(false);
  });
});

describe("host-snapshot bridge messages", () => {
  it("parses dodi:host_snapshot", () => {
    const parsed = ParentToGameMessageSchema.safeParse({
      type: "dodi:host_snapshot",
      token,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects dodi:host_snapshot with a bad token", () => {
    expect(
      ParentToGameMessageSchema.safeParse({
        type: "dodi:host_snapshot",
        token: "short",
      }).success,
    ).toBe(false);
  });

  it("accepts the shim's game:event host_snapshot reply via the catchall", () => {
    const parsed = GameToParentMessageSchema.safeParse({
      type: "game:event",
      token,
      payload: { event: "host_snapshot", snapshot: "data:image/png;base64,AAAA" },
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a null snapshot on a failed capture", () => {
    const parsed = GameToParentMessageSchema.safeParse({
      type: "game:event",
      token,
      payload: { event: "host_snapshot", snapshot: null },
    });
    expect(parsed.success).toBe(true);
  });
});
