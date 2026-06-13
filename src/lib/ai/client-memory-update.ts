/**
 * Client-side end-of-session memory update (E2EE). Builds the prompt from the
 * vault-decrypted current memory + persona soul + transcript, calls the thinking
 * provider in the browser, encrypts the new dossier, and writes ciphertext via
 * PATCH /api/profiles/[id]. The server never sees the transcript or the dossier.
 *
 * Runs while the page is alive (session end / inactivity / next-session
 * recovery) — not on page-hide, since an LLM call can't complete during unload.
 */
import { createClientThinkingProvider } from "@/lib/ai/client-thinking";
import {
  buildMemoryUpdateInstruction,
  parseMemoryUpdateResponse,
} from "@/lib/ai/memory-prompt";
import { AI_PROVIDERS } from "@/lib/ai/providers";
import { getActivePersona } from "@/lib/ai/voice-session";
import { encryptProfileFields } from "@/lib/vault";
import { useProfileStore } from "@/stores/profile-store";
import { useProvidersStore } from "@/stores/providers-store";
import { useVaultStore } from "@/stores/vault-store";
import type { AccountModelConfig } from "@/types/ai";

export async function runClientMemoryUpdate(
  profileId: string,
  sessionTranscript: string,
): Promise<void> {
  const session = useVaultStore.getState().session;
  if (!session) return; // locked — can't decrypt/encrypt

  const profile = await useProfileStore.getState().loadOne(profileId);
  if (!profile) return;

  const cfgRes = await fetch("/api/ai/config");
  if (!cfgRes.ok) return;
  const config = (await cfgRes.json()) as AccountModelConfig | null;
  if (!config) return;

  const thinkingProvider = config.thinkingProvider ?? config.voiceProvider;
  // Resolve a generateContent-capable model — never the Live (voice) model.
  const thinkingDef = AI_PROVIDERS.find((p) => p.id === thinkingProvider);
  const thinkingModel =
    config.thinkingModel ??
    thinkingDef?.models.find((m) => m.capabilities.includes("thinking"))?.id ??
    thinkingDef?.models.find((m) => !m.capabilities.includes("live"))?.id ??
    config.voiceModel;

  const providers = useProvidersStore.getState();
  if (!providers.providers) await providers.load();
  const apiKey = useProvidersStore.getState().getKey(thinkingProvider);
  if (!apiKey) return;

  const persona = await getActivePersona(profile.active_persona_id);
  const instruction = buildMemoryUpdateInstruction(persona.soul);
  const prompt = [
    "## Current Memory Document",
    profile.memory || "(empty — this was the first session)",
    "",
    "## Session Transcript",
    sessionTranscript,
  ].join("\n");

  const provider = createClientThinkingProvider(thinkingProvider, apiKey, thinkingModel);
  let responseText: string;
  try {
    const json = await provider.generateJson(instruction, prompt);
    responseText = JSON.stringify(json);
  } catch {
    responseText = await provider.generateText(instruction, prompt);
  }

  const result = parseMemoryUpdateResponse(responseText);
  const enc = encryptProfileFields(session, { memory: result.memory });

  await fetch(`/api/profiles/${profileId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memory: enc.memory }),
  });
  useProfileStore.getState().invalidate();
}
