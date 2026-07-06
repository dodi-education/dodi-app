/**
 * Resolve the "game generation" provider, model, and (vault-decrypted) API key
 * in the browser. Game authoring (creation, editing, success-definition mapping)
 * runs the Anthropic tool-use agent entirely client-side — the provider key
 * lives only in the unlocked vault and the server can never decrypt it.
 *
 * Mirrors resolve-client-thinking.ts. The game role is intentionally separate
 * from thinking: only agentic (tool-use) models can drive runGameAgent.
 */
import { dodi } from "@/lib/api";
import { AI_PROVIDERS } from "@dodi/ai/providers";
import { useProvidersStore } from "@/stores/providers-store";
import type { AccountModelConfig, AIProviderId } from "@dodi/types/ai";

export interface ResolvedClientGame {
  provider: AIProviderId;
  model: string;
  apiKey: string;
}

/**
 * Returns the game-generation provider/model/key, or null when no game model is
 * configured or no key is available (caller should prompt the parent to
 * configure a Game generation model in Settings).
 */
export async function resolveClientGame(): Promise<ResolvedClientGame | null> {
  const cfgRes = await dodi.request("/api/ai/config");
  if (!cfgRes.ok) return null;
  const config = (await cfgRes.json()) as AccountModelConfig | null;
  if (!config) return null;

  const provider = config.gameProvider;
  if (!provider) return null;
  const def = AI_PROVIDERS.find((p) => p.id === provider);
  const model =
    config.gameModel ??
    def?.models.find((m) => m.capabilities.includes("agentic"))?.id;

  const providers = useProvidersStore.getState();
  if (!providers.providers) await providers.load();
  const apiKey = useProvidersStore.getState().getKey(provider);

  if (!apiKey || !model) return null;
  return { provider, model, apiKey };
}
