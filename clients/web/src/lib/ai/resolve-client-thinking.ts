/**
 * Resolve the "thinking" provider, model, and (vault-decrypted) API key in the
 * browser, so client flows can hand the key to a server agent task that the
 * server itself cannot decrypt (keys live only in the unlocked vault).
 *
 * Mirrors the resolution in client-memory-update.ts.
 */
import { dodi } from "@/lib/api";
import { resolveExecution } from "@/lib/ai/resolve-dodi-ai";
import type { AccountModelConfig, AIProviderId } from "@dodi/types/ai";

export interface ResolvedClientThinking {
  provider: Exclude<AIProviderId, "dodi">;
  model: string;
  apiKey: string;
}

/**
 * Returns the thinking provider/model/key, or null when no config/key is
 * available (caller should prompt the parent to configure a provider key).
 */
export async function resolveClientThinking(): Promise<ResolvedClientThinking | null> {
  const cfgRes = await dodi.request("/api/ai/config");
  if (!cfgRes.ok) return null;
  const config = (await cfgRes.json()) as AccountModelConfig | null;
  if (!config) return null;

  // An explicit thinking provider is required — we never fall back to the voice
  // provider/model (Live models can't drive generateContent/agent tasks).
  const provider = config.thinkingProvider;
  if (!provider) return null;

  return resolveExecution({
    provider,
    category: "thinking",
    model: config.thinkingModel,
  });
}
