import { describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";

import type { DodiAIBillingStore } from "./dodi-ai-billing-store";
import type { DodiAIDefaultsStore } from "./dodi-ai-defaults-store";
import type { DodiAIKeyStatus, DodiAIKeyStore } from "./dodi-ai-key-store";
import {
  byokFallbackConfig,
  disableDodiAI,
  enableDodiAI,
  isDodiCustomized,
  needsDodiCredits,
  recommendedDodiConfig,
} from "./dodi-ai-settings";
import { type DraftModelConfig, EMPTY_DRAFT } from "./model-config";
import type { ProvidersStore } from "./providers-store";

function deps(opts: {
  keys?: unknown[] | null;
  status?: DodiAIKeyStatus;
  defaults?: unknown;
  providers?: Record<string, unknown>;
}) {
  const keyState = {
    status: opts.status ?? "active",
    load: vi.fn(async () => opts.keys ?? null),
    clear: vi.fn(),
  };
  const billingLoad = vi.fn(async () => null);
  return {
    dodiAIKeys: createStore(() => keyState) as unknown as DodiAIKeyStore,
    dodiAIDefaults: createStore(() => ({ load: vi.fn(async () => opts.defaults ?? null) })) as unknown as DodiAIDefaultsStore,
    dodiAIBilling: createStore(() => ({ load: billingLoad })) as unknown as DodiAIBillingStore,
    providers: createStore(() => ({ providers: opts.providers ?? {} })) as unknown as ProvidersStore,
    keyState,
    billingLoad,
  };
}

const ALL_DODI = recommendedDodiConfig("eve");

describe("derived state", () => {
  it("is customized only when a dodi category leaves the recommendation", () => {
    expect(isDodiCustomized(ALL_DODI)).toBe(false);
    expect(isDodiCustomized({ ...ALL_DODI, gameModel: "grok-4.6" })).toBe(true);
    expect(isDodiCustomized({ ...EMPTY_DRAFT, gameModel: "x" })).toBe(false);
  });

  it("needs credits when the keys were refused or the balance can't be used", () => {
    expect(needsDodiCredits(EMPTY_DRAFT, "no_balance", null)).toBe(true);
    const billing = { canUse: false } as Parameters<typeof needsDodiCredits>[2];
    expect(needsDodiCredits(ALL_DODI, "active", billing)).toBe(true);
    expect(needsDodiCredits(EMPTY_DRAFT, "active", billing)).toBe(false);
  });
});

describe("enable", () => {
  it("mints keys, writes the recommended config with the default voice, refreshes billing", async () => {
    const d = deps({ keys: [{}], defaults: { voice: { voice: "eve" } } });
    const apply = vi.fn(async () => true);
    await expect(enableDodiAI(d, apply)).resolves.toEqual({ kind: "enabled" });
    expect(d.keyState.load).toHaveBeenCalledWith(true);
    expect(apply).toHaveBeenCalledWith(ALL_DODI);
    expect(d.billingLoad).toHaveBeenCalledWith(true);
  });

  it("separates an empty balance from other failures", async () => {
    const apply = vi.fn(async () => true);
    await expect(enableDodiAI(deps({ status: "no_balance" }), apply)).resolves.toEqual({ kind: "no_balance" });
    await expect(enableDodiAI(deps({ status: "error" }), apply)).resolves.toEqual({
      kind: "error",
      key: "managedEnableFailed",
    });
    await expect(enableDodiAI(deps({ keys: [{}] }), apply)).resolves.toEqual({
      kind: "error",
      key: "managedUnavailable",
    });
    expect(apply).not.toHaveBeenCalled();
    await expect(
      enableDodiAI(deps({ keys: [{}], defaults: { voice: {} } }), vi.fn(async () => false)),
    ).resolves.toEqual({ kind: "error", key: "managedEnableFailed" });
  });
});

describe("disable", () => {
  it("falls back to own providers per category", () => {
    const next = byokFallbackConfig(ALL_DODI, ["anthropic", "xai"]) as DraftModelConfig;
    expect(next.voiceProvider).toBe("xai");
    expect(next.voiceName).toBe("ara");
    expect(next.thinkingProvider).toBe("anthropic");
    expect(next.gameProvider).toBe("anthropic");
    expect(next.imageProvider).toBe("xai");
    expect(byokFallbackConfig(ALL_DODI, ["anthropic"])).toBeNull();
    expect(byokFallbackConfig({ ...ALL_DODI, voiceProvider: "gemini" }, [])?.thinkingProvider).toBe("");
  });

  it("clears the config without an own voice provider, and drops the keys once saved", async () => {
    const d = deps({ providers: { anthropic: {} } });
    const apply = vi.fn(async () => true);
    const clear = vi.fn(async () => true);
    await expect(disableDodiAI(d, ALL_DODI, apply, clear)).resolves.toBe(true);
    expect(clear).toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
    expect(d.keyState.clear).toHaveBeenCalled();
  });

  it("keeps the keys when the save fails", async () => {
    const d = deps({ providers: { xai: {} } });
    await expect(disableDodiAI(d, ALL_DODI, vi.fn(async () => false), vi.fn())).resolves.toBe(false);
    expect(d.keyState.clear).not.toHaveBeenCalled();
  });
});
