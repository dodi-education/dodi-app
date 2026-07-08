/**
 * Client-side voice-session assembly (E2EE). Replaces the server session routes:
 * fetches the vault-decrypted kid/persona/memory/notes/game + the vault-held
 * provider key, builds the voice system instruction with the browser-safe
 * `dodi-context` builders, and returns a ready `VoiceClientConfig` (provider +
 * model + voice + tools). The server never sees child data or the key.
 *
 * model_config (provider/model selection) is plaintext, fetched from /api/ai/config.
 */
import { dodi } from "@/lib/api";
import type { VoiceClientConfig } from "@/lib/ai/voice-client";
import {
  buildGameVoiceContext,
  buildHomeVoiceContext,
  isTodayBirthday,
} from "@dodi/ai/dodi-context";
import { decryptPersona } from "@dodi/vault";
import { useKidStore } from "@/stores/kid-store";
import { useProvidersStore } from "@/stores/providers-store";
import { useVaultStore } from "@/stores/vault-store";
import type { AccountModelConfig } from "@dodi/types/ai";
import type { Game, Persona } from "@dodi/types/database";
import type { GameMetadata } from "@dodi/types/games";

export interface VoiceSessionConfig extends VoiceClientConfig {
  isBirthday?: boolean;
  language?: string;
}

interface CatalogEntry {
  id: string;
  title: string;
  description: string;
  tags: string[];
}

async function getModelConfig(): Promise<AccountModelConfig> {
  const res = await dodi.request("/api/ai/config");
  if (!res.ok) throw new Error("No AI provider configured");
  const cfg = (await res.json()) as AccountModelConfig | null;
  if (!cfg) throw new Error("No AI provider configured");
  return cfg;
}

async function getVoiceKey(config: AccountModelConfig): Promise<string> {
  const store = useProvidersStore.getState();
  if (!store.providers) await store.load();
  const key = useProvidersStore.getState().getKey(config.voiceProvider);
  if (!key) throw new Error(`No API key configured for ${config.voiceProvider}`);
  return key;
}

/** Active persona (or the global default), with its soul decrypted. */
export async function getActivePersona(activePersonaId: string | null): Promise<Persona> {
  const res = await dodi.request("/api/personas");
  if (!res.ok) throw new Error("Failed to load persona");
  const personas = (await res.json()) as Persona[];
  const persona =
    (activePersonaId ? personas.find((p) => p.id === activePersonaId) : null) ??
    personas.find((p) => p.is_system_default) ??
    personas[0];
  if (!persona) throw new Error("No persona available");
  const session = useVaultStore.getState().session;
  if (!session) throw new Error("Vault is locked");
  return decryptPersona(session, persona);
}

async function getGameCatalog(): Promise<CatalogEntry[]> {
  const res = await dodi.request("/api/games");
  if (!res.ok) return [];
  const games = (await res.json()) as Game[];
  return games.map((g) => ({
    id: g.id,
    title: g.title,
    description: g.description,
    tags: g.tags,
  }));
}

export async function buildHomeVoiceConfig(
  kidId: string,
): Promise<VoiceSessionConfig> {
  const kid = await useKidStore.getState().loadOne(kidId);
  if (!kid) throw new Error("Kid not found");

  const config = await getModelConfig();
  const apiKey = await getVoiceKey(config);
  const persona = await getActivePersona(kid.active_persona_id);
  const gameCatalog = await getGameCatalog();

  const { systemInstruction, tools } = buildHomeVoiceContext({
    personaSoul: persona.soul,
    childName: kid.display_name,
    childBirthdate: kid.birthdate,
    childLanguage: kid.language,
    memory: kid.memory,
    parentNotes: kid.parent_notes,
    gameCatalog,
  });

  return {
    provider: config.voiceProvider,
    apiKey,
    model: config.voiceModel,
    voiceName: config.voiceName,
    systemInstruction,
    ...(tools.length > 0 ? { tools } : {}),
    language: kid.language,
    isBirthday: isTodayBirthday(kid.birthdate),
  };
}

export async function buildGameVoiceConfig(
  kidId: string,
  gameId: string,
  gameState: Record<string, unknown>,
): Promise<VoiceSessionConfig> {
  const kid = await useKidStore.getState().loadOne(kidId);
  if (!kid) throw new Error("Kid not found");

  const config = await getModelConfig();
  const apiKey = await getVoiceKey(config);
  const persona = await getActivePersona(kid.active_persona_id);

  const gameRes = await dodi.request(`/api/games/${gameId}`);
  if (!gameRes.ok) throw new Error("Game not found");
  const game = (await gameRes.json()) as Game;
  const capabilities =
    (game.metadata as unknown as GameMetadata | null)?.capabilities ?? [];

  const { systemInstruction, tools } = buildGameVoiceContext({
    personaSoul: persona.soul,
    childName: kid.display_name,
    childBirthdate: kid.birthdate,
    childLanguage: kid.language,
    memory: kid.memory,
    parentNotes: kid.parent_notes,
    gameTitle: game.title,
    gameDescription: game.description,
    gameMarkdown: game.markdown,
    gameCodeBundle: game.code_bundle,
    gameState,
    capabilities,
  });

  return {
    provider: config.voiceProvider,
    apiKey,
    model: config.voiceModel,
    voiceName: config.voiceName,
    systemInstruction,
    ...(tools.length > 0 ? { tools } : {}),
    language: kid.language,
    isBirthday: isTodayBirthday(kid.birthdate),
  };
}
