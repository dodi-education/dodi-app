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
 * caller shows its existing "configure a provider" affordance. Keys are
 * resolved on the device and live in memory only.
 */
import { AI_PROVIDERS } from "@dodi/ai/providers";
import type { InferenceProvider } from "@dodi/billing-contract";
import { DODI_DEFAULT_MODEL, type AccountModelConfig, type AIProviderId } from "@dodi/types/ai";

import type { DodiAIClient } from "./dodi-ai";
import type { DodiAIDefaultsStore } from "./dodi-ai-defaults-store";
import type { DodiAIKeyStore } from "./dodi-ai-key-store";
import type { PlatformApi } from "./platform";
import type { ProvidersStore } from "./providers-store";

/** No thinking model (provider + key) is configured for the account. */
export class NoThinkingModelError extends Error {
  constructor() {
    super("No thinking model configured");
    this.name = "NoThinkingModelError";
  }
}

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

export interface ExecutionResolverDeps {
  api: PlatformApi;
  dodiAI: DodiAIClient;
  dodiAIDefaults: DodiAIDefaultsStore;
  dodiAIKeys: DodiAIKeyStore;
  providers: ProvidersStore;
}

export interface ExecutionResolver {
  resolveExecution(input: ResolveExecutionInput): Promise<ResolvedExecution | null>;
  /** The account's game-generation model (agentic, tool use) with its key. */
  resolveGame(): Promise<ResolvedExecution | null>;
  /** The account's image model with its key. */
  resolveImage(): Promise<ResolvedExecution | null>;
  /**
   * The account's thinking model with its key. An explicit thinking provider
   * is required — never the voice one (Live models can't drive text tasks).
   */
  resolveThinking(): Promise<ResolvedExecution | null>;
}

export function createExecutionResolver(deps: ExecutionResolverDeps): ExecutionResolver {
  const resolveManaged = async (
    input: ResolveExecutionInput,
  ): Promise<ResolvedExecution | null> => {
    if (!deps.dodiAI.isConfigured()) return null;

    const defaults = await deps.dodiAIDefaults.getState().load();
    if (!defaults) return null;
    const recommended = defaults[input.category];

    const model =
      !input.model || input.model === DODI_DEFAULT_MODEL ? recommended.model : input.model;

    const keys = await deps.dodiAIKeys.getState().load();
    if (!keys) return null;
    const apiKey = deps.dodiAIKeys.getState().getKey(recommended.provider as InferenceProvider);
    if (!apiKey) return null;

    return {
      provider: recommended.provider,
      model,
      apiKey,
      ...(input.category === "voice"
        ? { voiceName: input.voiceName ?? recommended.voice ?? "ara" }
        : {}),
    };
  };

  const resolveByok = async (input: ResolveExecutionInput): Promise<ResolvedExecution | null> => {
    const provider = input.provider as Exclude<AIProviderId, "dodi">;
    const def = AI_PROVIDERS.find((p) => p.id === provider);
    const model =
      input.model ??
      def?.models.find((m) => m.capabilities.includes(CATEGORY_CAPABILITY[input.category]))?.id;

    const store = deps.providers.getState();
    if (!store.providers) await store.load();
    const apiKey = deps.providers.getState().getKey(provider);

    if (!apiKey || !model) return null;
    return {
      provider,
      model,
      apiKey,
      ...(input.category === "voice" ? { voiceName: input.voiceName } : {}),
    };
  };

  const resolveExecution = (input: ResolveExecutionInput): Promise<ResolvedExecution | null> =>
    input.provider === "dodi" ? resolveManaged(input) : resolveByok(input);

  const loadConfig = async (): Promise<AccountModelConfig | null> => {
    const res = await deps.api.request("/api/ai/config");
    if (!res.ok) return null;
    return (await res.json()) as AccountModelConfig | null;
  };

  const resolveConfigured = async (
    category: "game" | "image" | "thinking",
  ): Promise<ResolvedExecution | null> => {
    const config = await loadConfig();
    if (!config) return null;
    const selection = {
      game: { provider: config.gameProvider, model: config.gameModel },
      image: { provider: config.imageProvider, model: config.imageModel },
      thinking: { provider: config.thinkingProvider, model: config.thinkingModel },
    }[category];
    if (!selection.provider) return null;
    return resolveExecution({ provider: selection.provider, category, model: selection.model });
  };

  return {
    resolveExecution,
    resolveGame: () => resolveConfigured("game"),
    resolveImage: () => resolveConfigured("image"),
    resolveThinking: () => resolveConfigured("thinking"),
  };
}
