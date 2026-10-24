/**
 * The account's per-capability AI model config (`/api/ai/config`, plaintext:
 * provider and model ids only, never a key) as the settings page edits it:
 * the draft shape, loading / saving / clearing it, and the option lists the
 * four pickers (Voice / Thinking / Game generation / Image) offer. Per-category
 * provider choice is how dodi AI combines with the parent's own keys.
 */
import { AI_PROVIDERS } from "@dodi/ai/providers";
import { type AccountModelConfig, type AIProviderId, DODI_DEFAULT_MODEL } from "@dodi/types/ai";
import type { VaultProviders } from "@dodi/vault";

import type { PlatformApi } from "./platform";
import type { ProvidersStore } from "./providers-store";

/** The settings page's editable mirror of AccountModelConfig ("" = unset). */
export interface DraftModelConfig {
  voiceProvider: AIProviderId | "";
  voiceModel: string;
  voiceName: string;
  thinkingProvider: AIProviderId | "";
  thinkingModel: string;
  gameProvider: AIProviderId | "";
  gameModel: string;
  imageProvider: AIProviderId | "";
  imageModel: string;
}

export const EMPTY_DRAFT: DraftModelConfig = {
  voiceProvider: "",
  voiceModel: "",
  voiceName: "",
  thinkingProvider: "",
  thinkingModel: "",
  gameProvider: "",
  gameModel: "",
  imageProvider: "",
  imageModel: "",
};

/** What a picker filters providers and models on. */
export type ModelCapability = "voice" | "thinking" | "agentic" | "image";

export interface ProviderOption {
  id: AIProviderId;
  name: string;
}

export function draftFromConfig(cfg: AccountModelConfig): DraftModelConfig {
  return {
    voiceProvider: cfg.voiceProvider ?? "",
    voiceModel: cfg.voiceModel ?? "",
    voiceName: cfg.voiceName ?? "",
    thinkingProvider: cfg.thinkingProvider ?? "",
    thinkingModel: cfg.thinkingModel ?? "",
    gameProvider: cfg.gameProvider ?? "",
    gameModel: cfg.gameModel ?? "",
    imageProvider: cfg.imageProvider ?? "",
    imageModel: cfg.imageModel ?? "",
  };
}

/**
 * The page's initial state: the vault's provider keys first (they decide which
 * pickers show), then the saved config. Null when there is no saved config or
 * anything failed (a locked vault is the gate's job).
 */
export async function loadModelConfigDraft(deps: {
  api: PlatformApi;
  providers: ProvidersStore;
}): Promise<DraftModelConfig | null> {
  try {
    await deps.providers.getState().load();
    const res = await deps.api.request("/api/ai/config");
    if (!res.ok) return null;
    const cfg = (await res.json()) as AccountModelConfig | null;
    return cfg ? draftFromConfig(cfg) : null;
  } catch {
    return null;
  }
}

function isVoiceSet(draft: DraftModelConfig): boolean {
  return Boolean(draft.voiceProvider && draft.voiceModel && draft.voiceName);
}

function isVoiceEmpty(draft: DraftModelConfig): boolean {
  return !draft.voiceProvider && !draft.voiceModel && !draft.voiceName;
}

/**
 * A draft can be saved when voice is all-or-nothing (a voiceless provider such
 * as Venice leaves it empty), every chosen category has a model, and at least
 * one category is set.
 */
export function isDraftSavable(draft: DraftModelConfig): boolean {
  if (!isVoiceSet(draft) && !isVoiceEmpty(draft)) return false;
  if (CATEGORY_FIELDS.some((f) => draft[f.provider] && !draft[f.model])) return false;
  return isVoiceSet(draft) || CATEGORY_FIELDS.some((f) => Boolean(draft[f.provider]));
}

/** PATCH the full config (unset categories absent); false when not savable or the save fails. */
export async function saveModelConfig(api: PlatformApi, next: DraftModelConfig): Promise<boolean> {
  if (!isDraftSavable(next)) return false;
  const voice = isVoiceSet(next)
    ? { voiceProvider: next.voiceProvider, voiceModel: next.voiceModel, voiceName: next.voiceName }
    : {};
  const res = await api.request("/api/ai/config", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...voice,
      thinkingProvider: next.thinkingProvider || undefined,
      thinkingModel: next.thinkingProvider ? next.thinkingModel : undefined,
      gameProvider: next.gameProvider || undefined,
      gameModel: next.gameProvider ? next.gameModel : undefined,
      imageProvider: next.imageProvider || undefined,
      imageModel: next.imageProvider ? next.imageModel : undefined,
    }),
  });
  return res.ok;
}

/**
 * Apply a new key's seed to the draft, filling only the categories still
 * unset (no provider picked): voice (provider, model, voice) is one group,
 * each of thinking / game / image (provider + model) another. A category the
 * parent chose is never overwritten.
 */
export function fillUnsetCategories(
  draft: DraftModelConfig,
  seed: Partial<DraftModelConfig> | null,
): DraftModelConfig {
  if (!seed) return draft;
  const next = { ...draft };
  if (!draft.voiceProvider && seed.voiceProvider && seed.voiceModel && seed.voiceName) {
    next.voiceProvider = seed.voiceProvider;
    next.voiceModel = seed.voiceModel;
    next.voiceName = seed.voiceName;
  }
  for (const f of CATEGORY_FIELDS) {
    const provider = seed[f.provider];
    const model = seed[f.model];
    if (!draft[f.provider] && provider && model) {
      next[f.provider] = provider;
      next[f.model] = model;
    }
  }
  return next;
}

/** DELETE the config: the account returns to unconfigured. */
export async function clearModelConfig(api: PlatformApi): Promise<boolean> {
  const res = await api.request("/api/ai/config", { method: "DELETE" });
  return res.ok;
}

/** True when any category runs on dodi AI ("enabled" is derived, not stored). */
export function usesDodiAI(config: {
  voiceProvider?: AIProviderId | "";
  thinkingProvider?: AIProviderId | "";
  gameProvider?: AIProviderId | "";
  imageProvider?: AIProviderId | "";
}): boolean {
  return [config.voiceProvider, config.thinkingProvider, config.gameProvider, config.imageProvider].includes(
    "dodi",
  );
}

/** The vault's providers as picker options (named from the registry). */
export function byokProviderOptions(providers: VaultProviders | null): ProviderOption[] {
  return Object.keys(providers ?? {}).map((id) => ({
    id: id as AIProviderId,
    name: AI_PROVIDERS.find((p) => p.id === id)?.name ?? id,
  }));
}

/**
 * Whether "dodi AI" is offered in the pickers: the control plane is configured
 * and either a category already uses it or its keys are active.
 */
export function isDodiSelectable(
  isDodiAIConfigured: boolean,
  draft: DraftModelConfig,
  keyStatus: string,
): boolean {
  return isDodiAIConfigured && (usesDodiAI(draft) || keyStatus === "active");
}

function supports(id: AIProviderId, capability: ModelCapability): boolean {
  const def = AI_PROVIDERS.find((d) => d.id === id);
  if (capability === "voice") return Boolean(def?.supportsVoice);
  if (capability === "thinking") return Boolean(def?.supportsThinking);
  if (capability === "agentic") return Boolean(def?.supportsAgentic);
  return Boolean(def?.supportsImage);
}

/**
 * A picker's providers: dodi AI first (when selectable, under the given
 * label), then the parent's own providers that support the capability.
 */
export function providerOptionsFor(
  capability: ModelCapability,
  byokProviders: ProviderOption[],
  dodiOptionLabel: string | null,
): ProviderOption[] {
  const options: ProviderOption[] = [];
  if (dodiOptionLabel !== null) options.push({ id: "dodi", name: dodiOptionLabel });
  for (const p of byokProviders) {
    if (supports(p.id, capability)) options.push(p);
  }
  return options;
}

/** A provider's models for a capability. */
export function modelOptionsFor(
  provider: AIProviderId | "",
  capability: ModelCapability,
): { id: string; name: string }[] {
  if (!provider) return [];
  const def = AI_PROVIDERS.find((p) => p.id === provider);
  return def?.models.filter((m) => m.capabilities.includes(capability)) ?? [];
}

/** Model when the provider changes: "default" for dodi, else the first matching model. */
export function defaultModelFor(provider: AIProviderId, capability: ModelCapability): string {
  if (provider === "dodi") return DODI_DEFAULT_MODEL;
  const def = AI_PROVIDERS.find((p) => p.id === provider);
  return (def?.models.find((m) => m.capabilities.includes(capability)) ?? def?.models[0])?.id ?? "";
}

/** The draft patch for picking a voice provider: its default model and first voice. */
export function voiceProviderPatch(provider: AIProviderId): Partial<DraftModelConfig> {
  const def = AI_PROVIDERS.find((p) => p.id === provider);
  return {
    voiceProvider: provider,
    voiceModel: defaultModelFor(provider, "voice"),
    voiceName: provider === "dodi" ? (def?.voices[0]?.id ?? "ara") : (def?.voices[0]?.id ?? ""),
  };
}

/** A provider's voices; null for no / an unknown provider (no voice pickers then). */
export function voiceOptionsFor(provider: AIProviderId | ""): { id: string; name: string }[] | null {
  return AI_PROVIDERS.find((p) => p.id === provider)?.voices ?? null;
}

/** The three non-voice categories: draft fields and the capability they filter on. */
export const CATEGORY_FIELDS = [
  { key: "thinking", capability: "thinking", provider: "thinkingProvider", model: "thinkingModel" },
  { key: "game", capability: "agentic", provider: "gameProvider", model: "gameModel" },
  { key: "image", capability: "image", provider: "imageProvider", model: "imageModel" },
] as const satisfies readonly {
  key: string;
  capability: ModelCapability;
  provider: keyof DraftModelConfig;
  model: keyof DraftModelConfig;
}[];

/** Format euro cents for the balance line. */
export function formatEurCents(cents: number, locale?: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(cents / 100);
}
