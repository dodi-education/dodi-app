/**
 * The parent's own provider keys ("bring your own key"): which providers can
 * still be added, and the add flow. A key is validated on this device with a
 * 1-token call straight to the provider, then sealed into the vault; the
 * server never sees it. Every added key returns a seed: the provider's
 * default model for each capability it supports (voice with its first voice,
 * thinking, game generation, image). The settings page fills only the
 * categories still unset with it (`fillUnsetCategories`), so a later key never
 * overrides a choice and a voiceless provider (e.g. Venice) still gets
 * defaults for everything else.
 */
import { AI_PROVIDERS } from "@dodi/ai/providers";
import type { AIProviderDefinition, AIProviderId } from "@dodi/types/ai";
import type { VaultProviders } from "@dodi/vault";

import { CATEGORY_FIELDS, type DraftModelConfig, defaultModelFor } from "./model-config";
import type { ProvidersStore } from "./providers-store";

/** `@dodi/ai/validate-key`'s signature (injected: it pulls in the provider SDKs). */
export type ValidateProviderKey = (
  providerId: AIProviderId,
  apiKey: string,
  model: string,
) => Promise<{ valid: boolean; error?: string }>;

export interface ByokKeyRow {
  id: AIProviderId;
  name: string;
  keyPreview: string;
  addedAt: string;
}

/** The stored keys as list rows (previews only, never the key). */
export function byokKeyRows(providers: VaultProviders | null): ByokKeyRow[] {
  return Object.entries(providers ?? {}).map(([id, entry]) => ({
    id: id as AIProviderId,
    name: AI_PROVIDERS.find((p) => p.id === id)?.name ?? id,
    keyPreview: entry?.keyPreview ?? "",
    addedAt: entry?.addedAt ?? "",
  }));
}

/** Providers a key can still be added for (managed ones have no key to paste). */
export function addableProviders(providers: VaultProviders | null): AIProviderDefinition[] {
  const present = new Set(Object.keys(providers ?? {}));
  return AI_PROVIDERS.filter((p) => !p.isManaged && !present.has(p.id));
}

/**
 * The model to validate with: a generateContent-capable one, NOT a Live
 * (voice) model, which only works over the Live WebSocket.
 */
export function validationModelFor(def: AIProviderDefinition | undefined): string {
  return (def?.models.find((m) => !m.capabilities.includes("live")) ?? def?.models[0])?.id ?? "";
}

/** Whether the provider definition supports a non-voice category's capability. */
function supportsCapability(
  def: AIProviderDefinition,
  capability: (typeof CATEGORY_FIELDS)[number]["capability"],
): boolean {
  if (capability === "thinking") return def.supportsThinking;
  if (capability === "agentic") return def.supportsAgentic;
  return def.supportsImage;
}

/**
 * The default config a new key seeds: voice (model + first voice) when the
 * provider supports it, plus the default model for every other capability it
 * supports. Null when it supports none of them.
 */
export function seedModelConfig(def: AIProviderDefinition): Partial<DraftModelConfig> | null {
  const seed: Partial<DraftModelConfig> = {};
  if (def.supportsVoice) {
    const model = def.models.find((m) => m.capabilities.includes("voice")) ?? def.models[0];
    const voice = def.voices[0];
    if (model && voice) {
      seed.voiceProvider = def.id;
      seed.voiceModel = model.id;
      seed.voiceName = voice.id;
    }
  }
  for (const field of CATEGORY_FIELDS) {
    if (!supportsCapability(def, field.capability)) continue;
    const model = defaultModelFor(def.id, field.capability);
    if (!model) continue;
    seed[field.provider] = def.id;
    seed[field.model] = model;
  }
  return Object.keys(seed).length > 0 ? seed : null;
}

export type AddProviderKeyOutcome =
  /** `seed`: the key's default config, to fill the unset categories with (null when it has none). */
  | { kind: "added"; seed: Partial<DraftModelConfig> | null }
  /** The provider rejected the key (its message, when it gave one). */
  | { kind: "invalid"; error?: string }
  /** Saving failed after validation (the error's text). */
  | { kind: "failed"; error: string };

export async function addProviderKey(
  deps: { providers: ProvidersStore; validateKey: ValidateProviderKey },
  input: { providerId: AIProviderId; apiKey: string },
  /** Called once the provider accepted the key, before it is sealed and saved. */
  onValidated?: () => void,
): Promise<AddProviderKeyOutcome> {
  const def = AI_PROVIDERS.find((p) => p.id === input.providerId);
  try {
    const result = await deps.validateKey(input.providerId, input.apiKey, validationModelFor(def));
    if (!result.valid) return { kind: "invalid", error: result.error || undefined };
    onValidated?.();

    await deps.providers.getState().addKey(input.providerId, input.apiKey);
    return { kind: "added", seed: def ? seedModelConfig(def) : null };
  } catch (error) {
    return {
      kind: "failed",
      error: error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}
