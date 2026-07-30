/**
 * THE single mapping point between a *configured* provider selection and an
 * *executable* one. "dodi" (the managed meta-provider) exists only in
 * `AccountModelConfig` and the settings UI — here it is translated to a real
 * upstream provider + a dodi-minted inference key, and the "default" model
 * sentinel is resolved against the platform_config recommendations. BYOK
 * selections pass through with their vault key. Downstream code (voice client
 * factory, thinking/image factories, the game agent, usage reporting) only
 * ever sees real provider and model ids.
 *
 * Fails closed: no balance / locked key / missing defaults ⇒ null, and the
 * caller shows its existing "configure a provider" affordance.
 */
import { isDodiAIConfigured } from "@/lib/dodi-ai";
import { AI_PROVIDERS } from "@dodi/ai/providers";
import { useDodiAIDefaultsStore } from "@/stores/dodi-ai-defaults-store";
import { useDodiAIKeyStore } from "@/stores/dodi-ai-key-store";
import { useProvidersStore } from "@/stores/providers-store";
import {
  DODI_DEFAULT_MODEL,
  type AIProviderId,
  type DodiAICategoryDefault,
  type DodiAIDefaults,
} from "@dodi/types/ai";
import type { InferenceProvider } from "@dodi/billing-contract";

export type DodiAICategory = "voice" | "thinking" | "game" | "image";

const CATEGORY_CAPABILITY: Record<DodiAICategory, "voice" | "thinking" | "agentic" | "image"> = {
  voice: "voice",
  thinking: "thinking",
  game: "agentic",
  image: "image",
};

export interface ResolveExecutionInput {
  provider: AIProviderId;
  category: DodiAICategory;
  model?: string;
  /** Voice category only. */
  voiceName?: string;
}

export interface ResolvedExecution {
  provider: Exclude<AIProviderId, "dodi">;
  model: string;
  apiKey: string;
  /** Voice category only. */
  voiceName?: string;
}

function categoryDefault(
  defaults: DodiAIDefaults,
  category: DodiAICategory,
): DodiAICategoryDefault {
  return defaults[category];
}

async function resolveManaged(
  input: ResolveExecutionInput,
): Promise<ResolvedExecution | null> {
  if (!isDodiAIConfigured()) return null;

  const defaults = await useDodiAIDefaultsStore.getState().load();
  if (!defaults) return null;
  const recommended = categoryDefault(defaults, input.category);

  const model =
    !input.model || input.model === DODI_DEFAULT_MODEL ? recommended.model : input.model;

  const keys = await useDodiAIKeyStore.getState().load();
  if (!keys) return null;
  const apiKey = useDodiAIKeyStore
    .getState()
    .getKey(recommended.provider as InferenceProvider);
  if (!apiKey) return null;

  return {
    provider: recommended.provider,
    model,
    apiKey,
    ...(input.category === "voice"
      ? { voiceName: input.voiceName ?? recommended.voice ?? "ara" }
      : {}),
  };
}

async function resolveByok(
  input: ResolveExecutionInput,
): Promise<ResolvedExecution | null> {
  const provider = input.provider as Exclude<AIProviderId, "dodi">;
  const def = AI_PROVIDERS.find((p) => p.id === provider);
  const model =
    input.model ??
    def?.models.find((m) => m.capabilities.includes(CATEGORY_CAPABILITY[input.category]))?.id;

  const store = useProvidersStore.getState();
  if (!store.providers) await store.load();
  const apiKey = useProvidersStore.getState().getKey(provider);

  if (!apiKey || !model) return null;
  return {
    provider,
    model,
    apiKey,
    ...(input.category === "voice" ? { voiceName: input.voiceName } : {}),
  };
}

export async function resolveExecution(
  input: ResolveExecutionInput,
): Promise<ResolvedExecution | null> {
  return input.provider === "dodi" ? resolveManaged(input) : resolveByok(input);
}
