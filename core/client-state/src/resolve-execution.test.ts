import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DodiAIDefaults } from "@dodi/types/ai";

/**
 * resolveExecution is the single point where the "dodi" meta-provider becomes
 * a real provider + dodi-minted key, and the "default" sentinel becomes a
 * concrete model. These tests pin: dodi→xai mapping, sentinel resolution,
 * fail-closed on no balance / self-host, and untouched BYOK passthrough.
 */
const state = vi.hoisted(() => ({
  dodiConfigured: true,
  defaults: {
    voice: { provider: "xai", model: "grok-voice-latest", voice: "ara" },
    thinking: { provider: "xai", model: "grok-4.3" },
    game: { provider: "xai", model: "grok-4.5" },
    image: { provider: "xai", model: "grok-imagine-image" },
  } as DodiAIDefaults | null,
  managedKeys: [
    { provider: "xai", apiKey: "xai-managed-secret", providerKeyId: "pk1", mintedAt: "t" },
  ] as
    | { provider: string; apiKey: string; providerKeyId: string; mintedAt: string }[]
    | null,
  vaultKeys: {} as Record<string, string>,
}));

import { createExecutionResolver } from "./resolve-execution";

const { resolveExecution } = createExecutionResolver({
  api: { request: () => Promise.reject(new Error("unused")) } as never,
  dodiAI: {
    isConfigured: () => state.dodiConfigured,
    request: () => Promise.reject(new Error("unused")),
  },
  dodiAIDefaults: { getState: () => ({ load: async () => state.defaults }) } as never,
  dodiAIKeys: {
    getState: () => ({
      load: async () => state.managedKeys,
      ensureFresh: async () => state.managedKeys,
      getKey: (p: string) => state.managedKeys?.find((k) => k.provider === p)?.apiKey ?? null,
    }),
  } as never,
  providers: {
    getState: () => ({
      providers: state.vaultKeys,
      load: async () => state.vaultKeys,
      getKey: (p: string) => state.vaultKeys[p] ?? null,
    }),
  } as never,
});


describe("resolveExecution — dodi (managed)", () => {
  beforeEach(() => {
    state.dodiConfigured = true;
    state.managedKeys = [
      { provider: "xai", apiKey: "xai-managed-secret", providerKeyId: "pk1", mintedAt: "t" },
    ];
  });

  it("maps dodi + 'default' sentinel to the recommended upstream model", async () => {
    const resolved = await resolveExecution({
      provider: "dodi",
      category: "thinking",
      model: "default",
    });
    expect(resolved).toEqual({
      provider: "xai",
      model: "grok-4.3",
      apiKey: "xai-managed-secret",
      isManaged: true,
    });
  });

  it("keeps a concrete model choice", async () => {
    const resolved = await resolveExecution({
      provider: "dodi",
      category: "game",
      model: "grok-4.5",
    });
    expect(resolved?.model).toBe("grok-4.5");
    expect(resolved?.provider).toBe("xai");
  });

  it("resolves voice with the configured voice name (defaults as fallback)", async () => {
    const explicit = await resolveExecution({
      provider: "dodi",
      category: "voice",
      model: "default",
      voiceName: "eve",
    });
    expect(explicit).toMatchObject({ model: "grok-voice-latest", voiceName: "eve" });

    const fallback = await resolveExecution({
      provider: "dodi",
      category: "voice",
      model: "default",
    });
    expect(fallback?.voiceName).toBe("ara");
  });

  it("fails closed with no balance (key store returns null)", async () => {
    state.managedKeys = null;
    const resolved = await resolveExecution({
      provider: "dodi",
      category: "thinking",
      model: "default",
    });
    expect(resolved).toBeNull();
  });

  it("fails closed on self-host (dodi AI not configured)", async () => {
    state.dodiConfigured = false;
    const resolved = await resolveExecution({
      provider: "dodi",
      category: "image",
      model: "default",
    });
    expect(resolved).toBeNull();
  });
});

describe("resolveExecution — dodi on Venice", () => {
  const xaiDefaults = state.defaults;
  beforeEach(() => {
    state.dodiConfigured = true;
    state.defaults = {
      voice: { provider: "xai", model: "grok-voice-latest", voice: "ara" },
      thinking: { provider: "venice", model: "grok-4-3" },
      game: { provider: "venice", model: "claude-opus-5-5" },
      image: { provider: "venice", model: "grok-imagine-image" },
    };
    state.managedKeys = [
      { provider: "xai", apiKey: "xai-managed-secret", providerKeyId: "pk1", mintedAt: "t" },
      { provider: "venice", apiKey: "venice-managed-secret", providerKeyId: "vk1", mintedAt: "t" },
    ];
  });
  afterEach(() => {
    state.defaults = xaiDefaults;
  });

  it("routes the category to Venice with the Venice key", async () => {
    const resolved = await resolveExecution({ provider: "dodi", category: "game", model: "default" });
    expect(resolved).toEqual({
      provider: "venice",
      model: "claude-opus-5-5",
      apiKey: "venice-managed-secret",
      isManaged: true,
    });
  });

  it("drops a stored model of the category's previous provider for the recommendation", async () => {
    // "grok-4.5" is an xAI id; Venice would reject it.
    const resolved = await resolveExecution({ provider: "dodi", category: "game", model: "grok-4.5" });
    expect(resolved).toMatchObject({ provider: "venice", model: "claude-opus-5-5" });
  });

  it("keeps a stored model that the current provider offers", async () => {
    const resolved = await resolveExecution({ provider: "dodi", category: "game", model: "grok-4-7" });
    expect(resolved).toMatchObject({ provider: "venice", model: "grok-4-7" });
  });

  it("keeps voice on xAI", async () => {
    const resolved = await resolveExecution({ provider: "dodi", category: "voice", model: "default" });
    expect(resolved).toMatchObject({ provider: "xai", apiKey: "xai-managed-secret" });
  });
});

describe("resolveExecution — BYOK passthrough", () => {
  beforeEach(() => {
    state.vaultKeys = { anthropic: "sk-ant-vault" };
  });

  it("returns the vault key and given model untouched", async () => {
    const resolved = await resolveExecution({
      provider: "anthropic",
      category: "thinking",
      model: "claude-sonnet-4-6",
    });
    expect(resolved).toEqual({
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      apiKey: "sk-ant-vault",
    });
  });

  it("falls back to the first capability-matching registry model", async () => {
    const resolved = await resolveExecution({
      provider: "anthropic",
      category: "game",
    });
    expect(resolved?.model).toBe("claude-opus-4-8");
  });

  it("fails closed without a vault key", async () => {
    state.vaultKeys = {};
    const resolved = await resolveExecution({
      provider: "anthropic",
      category: "thinking",
      model: "claude-sonnet-4-6",
    });
    expect(resolved).toBeNull();
  });
});

describe("resolveGame / resolveImage / resolveThinking — from the account config", () => {
  const resolverWith = (config: Record<string, string> | null) =>
    createExecutionResolver({
      api: {
        request: async (path: string) => {
          expect(path).toBe("/api/ai/config");
          return new Response(JSON.stringify(config));
        },
      } as never,
      dodiAI: { isConfigured: () => false, request: () => Promise.reject(new Error("unused")) },
      dodiAIDefaults: { getState: () => ({ load: async () => null }) } as never,
      dodiAIKeys: { getState: () => ({ load: async () => null, getKey: () => null }) } as never,
      providers: {
        getState: () => ({
          providers: { anthropic: {}, gemini: {} },
          load: async () => ({}),
          getKey: (p: string) => ({ anthropic: "sk-ant", gemini: "AIza" })[p] ?? null,
        }),
      } as never,
    });

  it("resolves each category from its own configured provider", async () => {
    const resolver = resolverWith({
      gameProvider: "anthropic",
      gameModel: "claude-opus-4-8",
      imageProvider: "gemini",
      imageModel: "imagen",
      voiceProvider: "gemini",
    });
    await expect(resolver.resolveGame()).resolves.toEqual({
      provider: "anthropic",
      model: "claude-opus-4-8",
      apiKey: "sk-ant",
    });
    await expect(resolver.resolveImage()).resolves.toMatchObject({ provider: "gemini" });
    // No explicit thinking provider: never falls back to the voice one.
    await expect(resolver.resolveThinking()).resolves.toBeNull();
  });

  it("is null without an account config", async () => {
    await expect(resolverWith(null).resolveGame()).resolves.toBeNull();
  });
});

describe("refreshKeys", () => {
  const resolverWithKeys = (keys: unknown[] | null, refresh: () => Promise<unknown>) =>
    createExecutionResolver({
      api: { request: () => Promise.reject(new Error("unused")) } as never,
      dodiAI: { isConfigured: () => true, request: () => Promise.reject(new Error("unused")) },
      dodiAIDefaults: { getState: () => ({ load: async () => null }) } as never,
      dodiAIKeys: { getState: () => ({ keys, refresh }) } as never,
      providers: { getState: () => ({}) } as never,
    });

  it("refetches held dodi AI keys", async () => {
    const refresh = vi.fn(async () => null);
    await resolverWithKeys([{ provider: "venice" }], refresh).refreshKeys();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when no managed keys are held (BYOK)", async () => {
    const refresh = vi.fn(async () => null);
    await resolverWithKeys(null, refresh).refreshKeys();
    expect(refresh).not.toHaveBeenCalled();
  });
});
