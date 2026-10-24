import { describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";

import { AI_PROVIDERS } from "@dodi/ai/providers";

import { addableProviders, addProviderKey, byokKeyRows, validationModelFor } from "./byok-keys";
import type { ProvidersStore } from "./providers-store";

function fakeProviders(existing: Record<string, unknown> = {}) {
  const addKey = vi.fn(async () => {});
  return {
    providers: createStore(() => ({ providers: existing, addKey })) as unknown as ProvidersStore,
    addKey,
  };
}

describe("BYOK keys", () => {
  it("lists previews and the providers still addable (never managed ones)", () => {
    const stored = { xai: { key: "secret", keyPreview: "abcd", addedAt: "2026-01-01" } };
    const xaiName = AI_PROVIDERS.find((p) => p.id === "xai")?.name;
    expect(byokKeyRows(stored)).toEqual([
      { id: "xai", name: xaiName, keyPreview: "abcd", addedAt: "2026-01-01" },
    ]);
    const ids = addableProviders(stored).map((p) => p.id);
    expect(ids).not.toContain("xai");
    expect(ids).not.toContain("dodi");
    expect(ids).toContain("anthropic");
  });

  it("validates with a non-live model", () => {
    const gemini = AI_PROVIDERS.find((p) => p.id === "gemini");
    expect(validationModelFor(gemini)).toBe("gemini-3.8-flash");
  });

  it("seals a valid first key and returns the voice config it seeds", async () => {
    const { providers, addKey } = fakeProviders();
    const validateKey = vi.fn(async () => ({ valid: true }));
    const onValidated = vi.fn();
    const outcome = await addProviderKey({ providers, validateKey }, { providerId: "xai", apiKey: "k" }, onValidated);
    expect(validateKey).toHaveBeenCalledWith("xai", "k", "grok-4.7");
    expect(onValidated).toHaveBeenCalled();
    expect(addKey).toHaveBeenCalledWith("xai", "k");
    expect(outcome).toEqual({
      kind: "added",
      seed: {
        voiceProvider: "xai",
        voiceModel: "grok-voice-latest",
        voiceName: "ara",
        thinkingProvider: "xai",
        thinkingModel: "grok-4.7",
        gameProvider: "xai",
        gameModel: "grok-4.7",
        imageProvider: "xai",
        imageModel: expect.any(String),
      },
    });
  });

  it("seeds the default model for every capability a voiceless provider supports", async () => {
    // Reported bug: a first Venice key (no voice) selected no defaults at all.
    const { providers } = fakeProviders();
    const outcome = await addProviderKey(
      { providers, validateKey: async () => ({ valid: true }) },
      { providerId: "venice", apiKey: "k" },
    );
    expect(outcome).toEqual({
      kind: "added",
      seed: {
        thinkingProvider: "venice",
        thinkingModel: "claude-opus-5-5",
        gameProvider: "venice",
        gameModel: "claude-opus-5-5",
        imageProvider: "venice",
        imageModel: "grok-imagine-image",
      },
    });
  });

  it("seeds a later key too (the page fills only the categories still unset)", async () => {
    const { providers } = fakeProviders({ venice: {} });
    const outcome = await addProviderKey(
      { providers, validateKey: async () => ({ valid: true }) },
      { providerId: "xai", apiKey: "k" },
    );
    expect(outcome.kind).toBe("added");
    expect(outcome.kind === "added" && outcome.seed).toMatchObject({
      voiceProvider: "xai",
      voiceModel: "grok-voice-latest",
      voiceName: "ara",
    });
  });

  it("never stores a rejected key", async () => {
    const { providers, addKey } = fakeProviders();
    await expect(
      addProviderKey(
        { providers, validateKey: async () => ({ valid: false, error: "401 bad key" }) },
        { providerId: "xai", apiKey: "k" },
      ),
    ).resolves.toEqual({ kind: "invalid", error: "401 bad key" });
    expect(addKey).not.toHaveBeenCalled();
  });

  it("reports a failed save", async () => {
    const { providers, addKey } = fakeProviders();
    addKey.mockRejectedValue(new Error("Failed to save providers"));
    await expect(
      addProviderKey({ providers, validateKey: async () => ({ valid: true }) }, { providerId: "xai", apiKey: "k" }),
    ).resolves.toEqual({ kind: "failed", error: "Failed to save providers" });
  });
});
