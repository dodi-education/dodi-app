import { beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("@/lib/dodi-ai", () => ({
  isDodiAIConfigured: () => state.dodiConfigured,
}));
vi.mock("@/stores/dodi-ai-defaults-store", () => ({
  useDodiAIDefaultsStore: {
    getState: () => ({ load: async () => state.defaults }),
  },
}));
vi.mock("@/stores/dodi-ai-key-store", () => ({
  useDodiAIKeyStore: {
    getState: () => ({
      load: async () => state.managedKeys,
      getKey: (p: string) =>
        state.managedKeys?.find((k) => k.provider === p)?.apiKey ?? null,
    }),
  },
}));
vi.mock("@/stores/providers-store", () => ({
  useProvidersStore: {
    getState: () => ({
      providers: state.vaultKeys,
      load: async () => state.vaultKeys,
      getKey: (p: string) => state.vaultKeys[p] ?? null,
    }),
  },
}));

import { resolveExecution } from "./resolve-dodi-ai";

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
