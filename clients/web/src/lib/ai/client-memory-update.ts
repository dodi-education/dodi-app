/**
 * Client-side end-of-session memory update (E2EE). Builds the prompt from the
 * vault-decrypted current memory + persona soul + transcript, calls the thinking
 * provider in the browser, encrypts the new dossier, and writes ciphertext via
 * PATCH /api/kids/[id]. The server never sees the transcript or the dossier.
 *
 * Driven by the day-batch outbox in the dodi session store: the full day's
 * transcript is submitted as one chunk on the first connect of a new day (or via
 * the manual ?process-memory trigger). Returns whether the encrypted write
 * succeeded so the caller only clears its outbox on success.
 */
import { dodi } from "@/lib/api";
import { createClientThinkingProvider } from "@dodi/ai/client-thinking";
import {
  buildMemoryUpdateInstruction,
  parseMemoryUpdateResponse,
} from "@dodi/ai/memory-prompt";
import { AI_PROVIDERS } from "@dodi/ai/providers";
import { getActivePersona } from "@/lib/ai/voice-session";
import { encryptKidFields } from "@dodi/vault";
import { useKidStore } from "@/stores/kid-store";
import { useProvidersStore } from "@/stores/providers-store";
import { useVaultStore } from "@/stores/vault-store";
import type { AccountModelConfig } from "@dodi/types/ai";

/**
 * Returns `true` only when the new dossier was successfully written to the DB
 * (PATCH ok). Any "can't process now" condition (locked vault, no thinking
 * model/key configured, network/LLM failure) returns `false` so the caller can
 * keep the transcript in its outbox and retry on the next connect — nothing is
 * dropped on failure.
 */
export async function runClientMemoryUpdate(
  kidId: string,
  sessionTranscript: string,
): Promise<boolean> {
  try {
    // loadOne awaits the vault unlock internally (kid-store `awaitSession`),
    // so a cold-load, still-unlocking vault WAITS here instead of dropping; a
    // terminally locked vault makes it throw → caught below → false.
    const kid = await useKidStore.getState().loadOne(kidId);
    if (!kid) return false;

    // Read the session only after loadOne resolved — by now the vault is
    // unlocked (loadOne decrypted the kid with it).
    const session = useVaultStore.getState().session;
    if (!session) return false;

    const cfgRes = await dodi.request("/api/ai/config");
    if (!cfgRes.ok) return false;
    const config = (await cfgRes.json()) as AccountModelConfig | null;
    if (!config) return false;

    // Memory updates need an explicit thinking model — never the voice provider/
    // model (Live models can't serve generateContent). Skip the update if unset.
    const thinkingProvider = config.thinkingProvider;
    if (!thinkingProvider) return false;
    const thinkingDef = AI_PROVIDERS.find((p) => p.id === thinkingProvider);
    const thinkingModel =
      config.thinkingModel ??
      thinkingDef?.models.find((m) => m.capabilities.includes("thinking"))?.id;
    if (!thinkingModel) return false;

    const providers = useProvidersStore.getState();
    if (!providers.providers) await providers.load();
    const apiKey = useProvidersStore.getState().getKey(thinkingProvider);
    if (!apiKey) return false;

    const persona = await getActivePersona(kid.active_persona_id);
    const instruction = buildMemoryUpdateInstruction(persona.soul);
    const prompt = [
      "## Current Memory Document",
      kid.memory || "(empty — this was the first session)",
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
    const enc = encryptKidFields(session, { memory: result.memory });

    const res = await dodi.request(`/api/kids/${kidId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memory: enc.memory }),
    });
    if (!res.ok) return false;

    useKidStore.getState().invalidate();
    return true;
  } catch {
    // Any unexpected failure (locked vault throw, network, parse) — keep the
    // outbox intact for retry.
    return false;
  }
}
