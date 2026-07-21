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
import { decodeView, ensureFriendKeys, fetchFriends } from "@/lib/friends";
import {
  buildGameVoiceContext,
  buildHomeVoiceContext,
  isTodayBirthday,
} from "@dodi/ai/dodi-context";
import { decryptPersona } from "@dodi/vault";
import { useGameStore } from "@/stores/game-store";
import { useKidStore } from "@/stores/kid-store";
import { useProvidersStore } from "@/stores/providers-store";
import { useVaultStore } from "@/stores/vault-store";
import type { AccountModelConfig } from "@dodi/types/ai";
import type { Kid, Persona } from "@dodi/types/database";
import type { GameMetadata } from "@dodi/types/games";

export interface VoiceSessionConfig extends VoiceClientConfig {
  isBirthday?: boolean;
  language?: string;
}

/**
 * The game context needed to build an in-game session prompt. Normally the
 * game row is (re-)fetched for the canonical title/description/markdown/code;
 * with `inline` set (snapshot play — the game row may be deleted or another
 * family's) the fetch is skipped and these fields are used as-is.
 */
export interface GameSessionContextInput {
  gameId: string;
  markdown: string;
  codeBundle: string;
  gameState: Record<string, unknown>;
  capabilities: string[];
  inline?: { title: string; description: string };
}

/**
 * Decrypted names of the kid's ACCEPTED friends, for the share_snapshot flow.
 * Best-effort: any failure (locked vault, no keys, network) returns [] — the
 * session must still connect, sharing is just hidden.
 */
export async function loadFriendNames(kid: Kid): Promise<string[]> {
  try {
    const session = useVaultStore.getState().session;
    if (!session) return [];
    const keys = await ensureFriendKeys(kid, session);
    const views = await fetchFriends(kid.id);
    return views
      .filter((v) => v.status === "accepted")
      .map((v) => {
        const decoded = decodeView(v, keys, session);
        return decoded.name ?? decoded.nickname;
      })
      .filter((name): name is string => !!name);
  } catch {
    return [];
  }
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

/**
 * The launch_game catalog dodi reasons over. Titles are E2EE, so this can only
 * be assembled from the decrypted cache — which is also why it is scoped to the
 * kid: the catalog is exactly what that child is allowed to play.
 */
async function getGameCatalog(kidId: string): Promise<CatalogEntry[]> {
  const games = await useGameStore.getState().loadForKid(kidId);
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
  const persona = await getActivePersona(kid.active_persona?.id ?? null);
  const gameCatalog = await getGameCatalog(kidId);

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

/** Title/description/markdown/code/capabilities for the session prompt. */
export interface ResolvedGameInfo {
  title: string;
  description: string;
  markdown: string;
  codeBundle: string;
  capabilities: string[];
}

/**
 * Resolve the game info: from the row normally, from the context for snapshot
 * play. `kidId` scopes the read so the platform derives that child's locale for
 * system-game translations (and enforces visibility).
 */
export async function resolveGameInfo(
  ctx: GameSessionContextInput,
  kidId?: string,
): Promise<ResolvedGameInfo> {
  if (ctx.inline) {
    return {
      title: ctx.inline.title,
      description: ctx.inline.description,
      markdown: ctx.markdown,
      codeBundle: ctx.codeBundle,
      capabilities: ctx.capabilities,
    };
  }
  // Decrypted by the game cache: the whole prompt below — briefing, and the full
  // source bundle — is plaintext only inside this browser.
  const game = await useGameStore.getState().loadOne(ctx.gameId, kidId);
  if (!game) throw new Error("Game not found");
  return {
    title: game.title,
    description: game.description,
    markdown: game.markdown ?? "",
    codeBundle: game.code_bundle,
    capabilities:
      (game.metadata as unknown as GameMetadata | null)?.capabilities ?? [],
  };
}

export async function buildGameVoiceConfig(
  kidId: string,
  ctx: GameSessionContextInput,
): Promise<VoiceSessionConfig> {
  const kid = await useKidStore.getState().loadOne(kidId);
  if (!kid) throw new Error("Kid not found");

  const config = await getModelConfig();
  const apiKey = await getVoiceKey(config);
  const persona = await getActivePersona(kid.active_persona?.id ?? null);
  const info = await resolveGameInfo(ctx, kidId);
  const friendNames = info.capabilities.includes("save_state")
    ? await loadFriendNames(kid)
    : [];

  const { systemInstruction, tools } = buildGameVoiceContext({
    personaSoul: persona.soul,
    childName: kid.display_name,
    childBirthdate: kid.birthdate,
    childLanguage: kid.language,
    memory: kid.memory,
    parentNotes: kid.parent_notes,
    gameTitle: info.title,
    gameDescription: info.description,
    gameMarkdown: info.markdown,
    gameCodeBundle: info.codeBundle,
    gameState: ctx.gameState,
    capabilities: info.capabilities,
    friendNames,
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
