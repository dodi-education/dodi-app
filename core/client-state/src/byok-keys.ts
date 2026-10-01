/**
 * The parent's own provider keys ("bring your own key"): which providers can
 * still be added, and the add flow. A key is validated on this device with a
 * 1-token call straight to the provider, then sealed into the vault; the
 * server never sees it. The first key on an unconfigured account seeds a
 * default voice config.
 */
import { AI_PROVIDERS } from "@dodi/ai/providers";
import type { AIProviderDefinition, AIProviderId } from "@dodi/types/ai";
import type { VaultProviders } from "@dodi/vault";

import type { DraftModelConfig } from "./model-config";
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

/** The default voice config the first key seeds (null when the provider has none). */
export function seedVoiceConfig(def: AIProviderDefinition): Partial<DraftModelConfig> | null {
  const model = def.models.find((m) => m.capabilities.includes("voice")) ?? def.models[0];
  const voice = def.voices[0];
  if (!model || !voice) return null;
  return { voiceProvider: def.id, voiceModel: model.id, voiceName: voice.id };
}

export type AddProviderKeyOutcome =
  /** `seed`: the first key's default voice config, to persist (null otherwise). */
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

    const isFirst = Object.keys(deps.providers.getState().providers ?? {}).length === 0;
    await deps.providers.getState().addKey(input.providerId, input.apiKey);
    return { kind: "added", seed: isFirst && def ? seedVoiceConfig(def) : null };
  } catch (error) {
    return {
      kind: "failed",
      error: error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}
