import { describe, expect, it, vi } from "vitest";

import { PIROUETTE } from "@dodi/character/tricks/dodi";
import { sealCustomTrick, type CustomTrickRecord } from "@dodi/vault/custom-trick-crypto";

vi.mock("@dodi/ai/client-thinking", () => ({
  createClientThinkingProvider: vi.fn(),
}));

import { createClientThinkingProvider } from "@dodi/ai/client-thinking";

import {
  canPerformTrick,
  createCustomTricksStore,
  teachTrick,
  trickLanguageName,
} from "./custom-tricks";
import { bodyOf, json, routedApi, unlockedVault } from "./parent-pages.test-support";

const RECORD: CustomTrickRecord = {
  v: 1,
  name: "Spin",
  description: "a spin",
  model: "dodi",
  requiredBones: ["root"],
  script: PIROUETTE as unknown as CustomTrickRecord["script"],
};

const RESOLVED = { provider: "anthropic" as const, model: "claude-x", apiKey: "sk-test" };

function mockProvider(answers: unknown[]): { generateJson: ReturnType<typeof vi.fn> } {
  const generateJson = vi.fn(async (): Promise<Record<string, unknown>> => {
    const next = answers.shift();
    if (next instanceof Error) throw next;
    return next as Record<string, unknown>;
  });
  vi.mocked(createClientThinkingProvider).mockReturnValue({ generateJson, generateText: vi.fn() });
  return { generateJson };
}

describe("custom tricks store", () => {
  it("loads and opens a companion's tricks once, dropping ones that don't open", async () => {
    const { vault, session } = unlockedVault();
    const api = routedApi({
      "/api/companions/c1/custom-tricks": json([
        { id: "t1", trick_enc: sealCustomTrick(session, RECORD) },
        { id: "t2", trick_enc: "enc:v1:garbage" },
      ]),
    });
    const store = createCustomTricksStore({ api, vault });
    const [first, again] = await Promise.all([store.getState().load("c1"), store.getState().load("c1")]);
    expect(first).toBe(again);
    expect(first.map((t) => t.id)).toEqual(["t1"]);
    expect(first[0].script.name).toBe("Pirouette");
    expect(api.request).toHaveBeenCalledTimes(1);
  });

  it("saves sealed and forgets", async () => {
    const { vault, session } = unlockedVault();
    const api = routedApi({
      "POST /api/companions/c1/custom-tricks": json({ id: "t9", trick_enc: "x" }, 201),
      "DELETE /api/companions/c1/custom-tricks/t9": json({}),
    });
    const store = createCustomTricksStore({ api, vault });
    const saved = await store.getState().save("c1", RECORD);
    const sealed = bodyOf(api, "/api/companions/c1/custom-tricks").trick_enc as string;
    expect(session.decryptJson(sealed)).toEqual(RECORD);
    expect(store.getState().byCompanion.c1).toEqual([saved]);
    await store.getState().remove("c1", "t9");
    expect(store.getState().byCompanion.c1).toEqual([]);
  });
});

describe("teachTrick", () => {
  const input = { kidId: "k1", model: "dodi" as const, description: "a spin", languageName: "English" };

  it("needs a thinking model", async () => {
    const result = await teachTrick({ resolveThinking: async () => null, reportUsage: vi.fn() }, input);
    expect(result).toEqual({ ok: false, reason: "no_thinking" });
  });

  it("fits the answer to the avatar and reports usage", async () => {
    mockProvider([{ v: 1, name: "Zoom", duration: 1, poses: [{ t: 0.5, bones: { root: { rot: [0, 360, 0] } } }] }]);
    const reportUsage = vi.fn();
    const result = await teachTrick({ resolveThinking: async () => RESOLVED, reportUsage }, input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record).toMatchObject({ name: "Zoom", description: "a spin", model: "dodi", requiredBones: ["root"] });
    const onUsage = vi.mocked(createClientThinkingProvider).mock.calls[0][3]!;
    onUsage({ inputTokens: 1, outputTokens: 2, cacheWriteTokens: 0, cacheReadTokens: 0 });
    expect(reportUsage).toHaveBeenCalledWith(expect.objectContaining({ eventType: "custom_trick", kidId: "k1" }));
  });

  it("retries once with the issues, then gives up without saving anything", async () => {
    const { generateJson } = mockProvider([{ v: 1, name: "", duration: 9, poses: [] }, new Error("boom")]);
    const result = await teachTrick({ resolveThinking: async () => RESOLVED, reportUsage: vi.fn() }, input);
    expect(result).toEqual({ ok: false, reason: "failed" });
    expect(generateJson).toHaveBeenCalledTimes(2);
    expect(String(generateJson.mock.calls[1][1])).toContain("not a valid motion script");
  });
});

describe("helpers", () => {
  it("knows which avatars can do a trick and names the kid's language", () => {
    expect(canPerformTrick({ requiredBones: ["root", "wing_L"] }, "dodi")).toBe(true);
    expect(canPerformTrick({ requiredBones: ["arm_L"] }, "dodi")).toBe(false);
    expect(trickLanguageName("de")).toBe("German");
    expect(trickLanguageName("fr")).toBe("English");
  });
});
