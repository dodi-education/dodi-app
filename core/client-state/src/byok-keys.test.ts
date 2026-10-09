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
      seed: { voiceProvider: "xai", voiceModel: "grok-voice-latest", voiceName: "ara" },
    });
  });

  it("seeds nothing once a key exists", async () => {
    const { providers } = fakeProviders({ gemini: {} });
    const outcome = await addProviderKey(
      { providers, validateKey: async () => ({ valid: true }) },
      { providerId: "anthropic", apiKey: "k" },
    );
    expect(outcome).toEqual({ kind: "added", seed: null });
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
