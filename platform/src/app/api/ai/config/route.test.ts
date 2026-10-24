import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PATCH /api/ai/config: voice is optional (an account on a voiceless provider
 * such as Venice has none) but all-or-nothing, and an empty config is refused.
 */

const { updateMock } = vi.hoisted(() => ({ updateMock: vi.fn() }));

vi.mock("@/lib/resolve-auth", () => ({
  requireAuth: vi.fn(async () => ({ accountId: "acc-1", db: {}, via: "user" })),
}));
vi.mock("@/lib/error-logs", () => ({
  serverErrorResponse: vi.fn(
    () => new Response(JSON.stringify({ error: "server" }), { status: 500 }),
  ),
}));
vi.mock("@/services/ai-providers", () => ({
  clearModelConfig: vi.fn(),
  getModelConfig: vi.fn(),
  updateModelConfig: updateMock,
}));

import { PATCH } from "./route";

function patch(body: unknown): Request {
  return new Request("https://platform.test/api/ai/config", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/ai/config", () => {
  beforeEach(() => {
    updateMock.mockReset().mockResolvedValue(undefined);
  });

  it("saves a config without voice (a voiceless provider like Venice)", async () => {
    const res = await PATCH(patch({ thinkingProvider: "venice", thinkingModel: "claude-opus-5-5" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ thinkingProvider: "venice", thinkingModel: "claude-opus-5-5" });
    expect(updateMock).toHaveBeenCalledWith(
      {},
      "acc-1",
      expect.objectContaining({ thinkingProvider: "venice", voiceProvider: undefined }),
    );
  });

  it("saves a complete voice config", async () => {
    const res = await PATCH(
      patch({ voiceProvider: "xai", voiceModel: "grok-voice-latest", voiceName: "ara" }),
    );
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalled();
  });

  it("rejects a half-set voice group", async () => {
    const res = await PATCH(
      patch({ voiceProvider: "xai", thinkingProvider: "venice", thinkingModel: "claude-opus-5-5" }),
    );
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects an empty config", async () => {
    const res = await PATCH(patch({}));
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
