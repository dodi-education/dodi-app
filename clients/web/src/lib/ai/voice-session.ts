/**
 * Client-side voice-session assembly (E2EE). Replaces the server session routes:
 * fetches the vault-decrypted profile/persona/memory/notes/game + the vault-held
 * provider key, builds the Gemini Live system instruction with the browser-safe
 * `dodi-context` builders, and returns a ready `GeminiLiveConfig`. The server
 * never sees child data or the key.
 *
 * model_config (provider/model selection) is plaintext, fetched from /api/ai/config.
 */
import type { GeminiLiveConfig } from "@/lib/ai/gemini-live-client";
import {
  buildGameVoiceContext,
  buildHomeVoiceContext,
  isTodayBirthday,
} from "@/lib/services/dodi-context";
import { decryptPersona } from "@/lib/vault";
import { useProfileStore } from "@/stores/profile-store";
import { useProvidersStore } from "@/stores/providers-store";
import { useVaultStore } from "@/stores/vault-store";
import type { AccountModelConfig } from "@dodi/types/ai";
import type { Game, Persona } from "@dodi/types/database";

export interface VoiceSessionConfig extends GeminiLiveConfig {
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
  const res = await fetch("/api/ai/config");
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
  const res = await fetch("/api/personas");
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
  const res = await fetch("/api/games");
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
  profileId: string,
): Promise<VoiceSessionConfig> {
  const profile = await useProfileStore.getState().loadOne(profileId);
  if (!profile) throw new Error("Profile not found");

  const config = await getModelConfig();
  const apiKey = await getVoiceKey(config);
  const persona = await getActivePersona(profile.active_persona_id);
  const gameCatalog = await getGameCatalog();

  const { systemInstruction, tools } = buildHomeVoiceContext({
    personaSoul: persona.soul,
    childName: profile.display_name,
    childBirthdate: profile.birthdate,
    childLanguage: profile.language,
    memory: profile.memory,
    parentNotes: profile.parent_notes,
    gameCatalog,
  });

  return {
    apiKey,
    model: config.voiceModel,
    voiceName: config.voiceName,
    systemInstruction,
    ...(tools.length > 0 ? { tools } : {}),
    language: profile.language,
    isBirthday: isTodayBirthday(profile.birthdate),
  };
}

export async function buildGameVoiceConfig(
  profileId: string,
  gameId: string,
  gameState: Record<string, unknown>,
): Promise<VoiceSessionConfig> {
  const profile = await useProfileStore.getState().loadOne(profileId);
  if (!profile) throw new Error("Profile not found");

  const config = await getModelConfig();
  const apiKey = await getVoiceKey(config);
  const persona = await getActivePersona(profile.active_persona_id);

  const gameRes = await fetch(`/api/games/${gameId}`);
  if (!gameRes.ok) throw new Error("Game not found");
  const game = (await gameRes.json()) as Game;

  const { systemInstruction, tools } = buildGameVoiceContext({
    personaSoul: persona.soul,
    childName: profile.display_name,
    childBirthdate: profile.birthdate,
    childLanguage: profile.language,
    memory: profile.memory,
    parentNotes: profile.parent_notes,
    gameTitle: game.title,
    gameDescription: game.description,
    gameMarkdown: game.markdown,
    gameCodeBundle: game.code_bundle,
    gameState,
  });

  return {
    apiKey,
    model: config.voiceModel,
    voiceName: config.voiceName,
    systemInstruction,
    ...(tools.length > 0 ? { tools } : {}),
    language: profile.language,
    isBirthday: isTodayBirthday(profile.birthdate),
  };
}
