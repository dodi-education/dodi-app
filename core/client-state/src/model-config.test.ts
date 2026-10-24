import { describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";

import {
  type DraftModelConfig,
  EMPTY_DRAFT,
  byokProviderOptions,
  clearModelConfig,
  defaultModelFor,
  fillUnsetCategories,
  isDodiSelectable,
  isDraftSavable,
  loadModelConfigDraft,
  modelOptionsFor,
  providerOptionsFor,
  saveModelConfig,
  voiceProviderPatch,
} from "./model-config";
import type { PlatformApi } from "./platform";
import type { ProvidersStore, ProvidersStoreState } from "./providers-store";

function fakeApi(response: Response | Error): PlatformApi & { request: ReturnType<typeof vi.fn> } {
  return {
    request: vi.fn(async () => {
      if (response instanceof Error) throw response;
      return response;
    }),
    getVaultKeys: async () => null,
    putVaultKeys: async () => {},
  };
}

function fakeProviders(load = vi.fn(async () => ({}))): ProvidersStore {
  return createStore(() => ({ providers: null, load }) as unknown as ProvidersStoreState);
}

const XAI_VOICE: DraftModelConfig = {
  ...EMPTY_DRAFT,
  voiceProvider: "xai",
  voiceModel: "grok-voice-latest",
  voiceName: "ara",
};

const VENICE_THINKING: DraftModelConfig = {
  ...EMPTY_DRAFT,
  thinkingProvider: "venice",
  thinkingModel: "claude-opus-5-5",
};

describe("loading", () => {
  it("loads the vault's providers first, then maps the saved config to a draft", async () => {
    const load = vi.fn(async () => ({}));
    const api = fakeApi(
      new Response(JSON.stringify({ voiceProvider: "xai", voiceModel: "m", voiceName: "ara", gameProvider: "anthropic" })),
    );
    const draft = await loadModelConfigDraft({ api, providers: fakeProviders(load) });
    expect(load).toHaveBeenCalled();
    expect(draft).toEqual({ ...EMPTY_DRAFT, voiceProvider: "xai", voiceModel: "m", voiceName: "ara", gameProvider: "anthropic" });
  });

  it("is null without a saved config or when the vault is locked", async () => {
    await expect(
      loadModelConfigDraft({ api: fakeApi(new Response("null")), providers: fakeProviders() }),
    ).resolves.toBeNull();
    const locked = fakeProviders(vi.fn(async () => Promise.reject(new Error("Vault is locked"))));
    const api = fakeApi(new Response("{}"));
    await expect(loadModelConfigDraft({ api, providers: locked })).resolves.toBeNull();
    expect(api.request).not.toHaveBeenCalled();
  });
});

describe("saving", () => {
  it("needs a complete voice config and a model for every chosen category", () => {
    expect(isDraftSavable(EMPTY_DRAFT)).toBe(false);
    expect(isDraftSavable(XAI_VOICE)).toBe(true);
    expect(isDraftSavable({ ...XAI_VOICE, gameProvider: "anthropic" })).toBe(false);
  });

  it("saves a config without voice (a voiceless provider like Venice)", () => {
    // Reported bug: with only a Venice key, Save stayed disabled after picking a model.
    expect(isDraftSavable(VENICE_THINKING)).toBe(true);
  });

  it("refuses a half-set voice config", () => {
    expect(isDraftSavable({ ...VENICE_THINKING, voiceProvider: "xai" })).toBe(false);
    expect(isDraftSavable({ ...VENICE_THINKING, voiceProvider: "xai", voiceModel: "grok-voice-latest" })).toBe(false);
  });

  it("sends a voiceless config without voice fields", async () => {
    const api = fakeApi(new Response("{}"));
    await expect(saveModelConfig(api, VENICE_THINKING)).resolves.toBe(true);
    const [, init] = api.request.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ thinkingProvider: "venice", thinkingModel: "claude-opus-5-5" });
  });

  it("sends unset categories as absent", async () => {
    const api = fakeApi(new Response("{}"));
    await expect(saveModelConfig(api, { ...XAI_VOICE, thinkingModel: "stale" })).resolves.toBe(true);
    const [path, init] = api.request.mock.calls[0];
    expect(path).toBe("/api/ai/config");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ voiceProvider: "xai", voiceModel: "grok-voice-latest", voiceName: "ara" });
  });

  it("refuses an empty or half-set config without a request", async () => {
    const api = fakeApi(new Response("{}"));
    await expect(saveModelConfig(api, EMPTY_DRAFT)).resolves.toBe(false);
    await expect(saveModelConfig(api, { ...EMPTY_DRAFT, voiceProvider: "xai" })).resolves.toBe(false);
    expect(api.request).not.toHaveBeenCalled();
  });

  it("clears the config", async () => {
    const api = fakeApi(new Response("{}"));
    await expect(clearModelConfig(api)).resolves.toBe(true);
    expect(api.request).toHaveBeenCalledWith("/api/ai/config", { method: "DELETE" });
  });
});

describe("picker options", () => {
  const byok = byokProviderOptions({
    gemini: { key: "k", keyPreview: "1234", addedAt: "" },
    anthropic: { key: "k", keyPreview: "5678", addedAt: "" },
  });

  it("names the vault's providers from the registry", () => {
    expect(byok.map((p) => p.id)).toEqual(["gemini", "anthropic"]);
    expect(byok[0].name).toBe("Google Gemini");
  });

  it("filters by capability and puts dodi AI first when offered", () => {
    expect(providerOptionsFor("voice", byok, null).map((p) => p.id)).toEqual(["gemini"]);
    expect(providerOptionsFor("agentic", byok, "dodi AI").map((p) => p.id)).toEqual(["dodi", "anthropic"]);
  });

  it("offers dodi AI only when configured and in use or active", () => {
    expect(isDodiSelectable(false, XAI_VOICE, "active")).toBe(false);
    expect(isDodiSelectable(true, XAI_VOICE, "idle")).toBe(false);
    expect(isDodiSelectable(true, XAI_VOICE, "active")).toBe(true);
    expect(isDodiSelectable(true, { ...XAI_VOICE, imageProvider: "dodi" }, "idle")).toBe(true);
  });

  it("defaults the model per provider", () => {
    expect(defaultModelFor("dodi", "thinking")).toBe("default");
    expect(defaultModelFor("gemini", "image")).toBe(modelOptionsFor("gemini", "image")[0].id);
    expect(modelOptionsFor("", "voice")).toEqual([]);
    expect(voiceProviderPatch("xai")).toEqual({ voiceProvider: "xai", voiceModel: "grok-voice-latest", voiceName: "ara" });
    expect(voiceProviderPatch("dodi")).toMatchObject({ voiceProvider: "dodi", voiceModel: "default" });
  });
});

describe("seeding", () => {
  const XAI_SEED: Partial<DraftModelConfig> = {
    voiceProvider: "xai",
    voiceModel: "grok-voice-latest",
    voiceName: "ara",
    thinkingProvider: "xai",
    thinkingModel: "grok-4.7",
  };

  it("fills an empty draft with the seed", () => {
    expect(fillUnsetCategories(EMPTY_DRAFT, XAI_SEED)).toEqual({ ...EMPTY_DRAFT, ...XAI_SEED });
  });

  it("never overwrites a category the parent already chose", () => {
    expect(fillUnsetCategories(VENICE_THINKING, XAI_SEED)).toEqual({
      ...VENICE_THINKING,
      voiceProvider: "xai",
      voiceModel: "grok-voice-latest",
      voiceName: "ara",
    });
  });

  it("is a no-op without a seed", () => {
    expect(fillUnsetCategories(VENICE_THINKING, null)).toEqual(VENICE_THINKING);
  });
});
