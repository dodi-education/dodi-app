/**
 * The dodi AI state card's flows: enable (mint keys, then write the
 * "default"-sentinel config for every category), disable (fall back to the
 * parent's own keys per category, or clear the config when no own voice
 * provider exists) and the derived states (customized, needs credits).
 * "Enabled" is derived: any category on "dodi"; there is no stored flag.
 */
import { AI_PROVIDERS } from "@dodi/ai/providers";
import type { BillingStatusResponse } from "@dodi/billing-contract";
import { type AIProviderId, DODI_DEFAULT_MODEL } from "@dodi/types/ai";

import type { DodiAIBillingStore } from "./dodi-ai-billing-store";
import type { DodiAIDefaultsStore } from "./dodi-ai-defaults-store";
import type { DodiAIKeyStatus, DodiAIKeyStore } from "./dodi-ai-key-store";
import { type DraftModelConfig, usesDodiAI } from "./model-config";
import type { ProvidersStore } from "./providers-store";

const CATEGORIES = ["voice", "thinking", "game", "image"] as const;

/** Enabled, and at least one dodi category runs a model other than the recommendation. */
export function isDodiCustomized(config: DraftModelConfig): boolean {
  return (
    usesDodiAI(config) &&
    CATEGORIES.some(
      (c) => config[`${c}Provider` as const] === "dodi" && config[`${c}Model` as const] !== DODI_DEFAULT_MODEL,
    )
  );
}

/** The balance is empty (keys refused, or enabled with a balance that can't be used). */
export function needsDodiCredits(
  config: DraftModelConfig,
  keyStatus: DodiAIKeyStatus,
  billing: BillingStatusResponse | null,
): boolean {
  return keyStatus === "no_balance" || (usesDodiAI(config) && billing !== null && !billing.canUse);
}

/** Every category on dodi AI's recommendation. */
export function recommendedDodiConfig(voiceName: string | undefined): DraftModelConfig {
  return {
    voiceProvider: "dodi",
    voiceModel: DODI_DEFAULT_MODEL,
    voiceName: voiceName ?? "ara",
    thinkingProvider: "dodi",
    thinkingModel: DODI_DEFAULT_MODEL,
    gameProvider: "dodi",
    gameModel: DODI_DEFAULT_MODEL,
    imageProvider: "dodi",
    imageModel: DODI_DEFAULT_MODEL,
  };
}

export interface DodiAISettingsDeps {
  dodiAIKeys: DodiAIKeyStore;
  dodiAIDefaults: DodiAIDefaultsStore;
  dodiAIBilling: DodiAIBillingStore;
  providers: ProvidersStore;
}

/** PATCH the full config and mirror it into the page state; true when saved. */
export type ApplyModelConfig = (next: DraftModelConfig) => Promise<boolean>;

export type EnableDodiAIOutcome =
  | { kind: "enabled" }
  /** No balance: the needs-credits state shows (via the key store's status). */
  | { kind: "no_balance" }
  | { kind: "error"; key: "managedEnableFailed" | "managedUnavailable" };

export async function enableDodiAI(
  deps: DodiAISettingsDeps,
  applyConfig: ApplyModelConfig,
): Promise<EnableDodiAIOutcome> {
  const keys = await deps.dodiAIKeys.getState().load(true);
  if (!keys) {
    return deps.dodiAIKeys.getState().status === "no_balance"
      ? { kind: "no_balance" }
      : { kind: "error", key: "managedEnableFailed" };
  }
  const defaults = await deps.dodiAIDefaults.getState().load();
  if (!defaults) return { kind: "error", key: "managedUnavailable" };
  const ok = await applyConfig(recommendedDodiConfig(defaults.voice.voice));
  if (!ok) return { kind: "error", key: "managedEnableFailed" };
  void deps.dodiAIBilling.getState().load(true);
  return { kind: "enabled" };
}

type SupportFlag = "supportsVoice" | "supportsThinking" | "supportsAgentic" | "supportsImage";

/**
 * The config after turning dodi AI off: each dodi category falls back to the
 * first own provider supporting it ("" when none). Null when voice runs on
 * dodi AI and no own provider can take it: the config must be cleared.
 */
export function byokFallbackConfig(
  config: DraftModelConfig,
  vaultProviderIds: AIProviderId[],
): DraftModelConfig | null {
  const byokWith = (flag: SupportFlag) =>
    vaultProviderIds
      .map((id) => AI_PROVIDERS.find((p) => p.id === id))
      .find((def) => def && !def.isManaged && def[flag]);

  const next: DraftModelConfig = { ...config };
  if (config.voiceProvider === "dodi") {
    const def = byokWith("supportsVoice");
    if (!def) return null;
    next.voiceProvider = def.id;
    next.voiceModel = (def.models.find((m) => m.capabilities.includes("voice")) ?? def.models[0])?.id ?? "";
    next.voiceName = def.voices[0]?.id ?? "";
  }
  if (config.thinkingProvider === "dodi") {
    const def = byokWith("supportsThinking");
    next.thinkingProvider = def?.id ?? "";
    next.thinkingModel = def?.models.find((m) => m.capabilities.includes("thinking"))?.id ?? "";
  }
  if (config.gameProvider === "dodi") {
    const def = byokWith("supportsAgentic");
    next.gameProvider = def?.id ?? "";
    next.gameModel = def?.models.find((m) => m.capabilities.includes("agentic"))?.id ?? "";
  }
  if (config.imageProvider === "dodi") {
    const def = byokWith("supportsImage");
    next.imageProvider = def?.id ?? "";
    next.imageModel = def?.models.find((m) => m.capabilities.includes("image"))?.id ?? "";
  }
  return next;
}

/**
 * Turn dodi AI off. The commercial key is NOT revoked (enforcement stays on
 * the balance / lock plane); only the client's in-memory secrets are dropped.
 */
export async function disableDodiAI(
  deps: Pick<DodiAISettingsDeps, "dodiAIKeys" | "providers">,
  config: DraftModelConfig,
  applyConfig: ApplyModelConfig,
  clearConfig: () => Promise<boolean>,
): Promise<boolean> {
  const vaultProviderIds = Object.keys(deps.providers.getState().providers ?? {}) as AIProviderId[];
  const next = byokFallbackConfig(config, vaultProviderIds);
  const ok = next === null ? await clearConfig() : await applyConfig(next);
  if (ok) deps.dodiAIKeys.getState().clear();
  return ok;
}
