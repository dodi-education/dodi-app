/**
 * Resolve the "image" provider, model, and (vault-decrypted) API key in the
 * browser. Image generation runs entirely client-side — the provider key lives
 * only in the unlocked vault and the server can never decrypt it.
 *
 * Mirrors resolve-client-thinking.ts.
 */
import { dodi } from "@/lib/api";
import { AI_PROVIDERS } from "@dodi/ai/providers";
import { useProvidersStore } from "@/stores/providers-store";
import type { AccountModelConfig, AIProviderId } from "@dodi/types/ai";

export interface ResolvedClientImage {
  provider: AIProviderId;
  model: string;
  apiKey: string;
}

/**
 * Returns the image provider/model/key, or null when no image model is
 * configured or no key is available (caller should surface a gentle prompt to
 * configure an image model in Settings).
 */
export async function resolveClientImage(): Promise<ResolvedClientImage | null> {
  const cfgRes = await dodi.request("/api/ai/config");
  if (!cfgRes.ok) return null;
  const config = (await cfgRes.json()) as AccountModelConfig | null;
  if (!config) return null;

  const provider = config.imageProvider;
  if (!provider) return null;
  const def = AI_PROVIDERS.find((p) => p.id === provider);
  const model =
    config.imageModel ??
    def?.models.find((m) => m.capabilities.includes("image"))?.id;

  const providers = useProvidersStore.getState();
  if (!providers.providers) await providers.load();
  const apiKey = useProvidersStore.getState().getKey(provider);

  if (!apiKey || !model) return null;
  return { provider, model, apiKey };
}
