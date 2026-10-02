/**
 * Device-side voice-session assembly (E2EE): turns the vault-decrypted kid,
 * persona, game and the resolved voice provider + key into a ready
 * {@link VoiceSessionConfig}, using the `dodi-context` prompt builders. The
 * server never sees child data or the key.
 *
 * Where the data comes from (stores, the platform API, the vault) is the
 * caller's business: it hands in {@link VoiceSessionSources}
 * (`@dodi/client-state` wires them from its stores).
 */
import type { Kid, Persona } from "@dodi/types/database";

import {
  buildGameVoiceContext,
  buildHomeVoiceContext,
  isTodayBirthday,
} from "../dodi-context";
import type { VoiceClientConfig } from "./voice-client";

export interface VoiceSessionConfig extends VoiceClientConfig {
  isBirthday?: boolean;
  language?: string;
}

/**
 * The game context needed to build an in-game session prompt. Normally the
 * game row is (re-)fetched for the canonical title/description/markdown/code;
 * with `inline` set (snapshot play: the game row may be deleted or another
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

/** Title/description/markdown/code/capabilities for the session prompt. */
export interface ResolvedGameInfo {
  title: string;
  description: string;
  markdown: string;
  codeBundle: string;
  capabilities: string[];
}

export interface VoiceCatalogEntry {
  id: string;
  title: string;
  description: string;
  tags: string[];
}

/** The executable voice provider/model/voice/key (never the "dodi" meta-provider). */
export interface ResolvedVoice {
  provider: VoiceClientConfig["provider"];
  model: string;
  voiceName: string;
  apiKey: string;
}

/** Data loaders the builders read through. All decrypt on the device. */
export interface VoiceSessionSources {
  loadKid(kidId: string): Promise<Kid | null>;
  /** Voice provider/model/voice + key; throws when none is configured. */
  resolveVoice(): Promise<ResolvedVoice>;
  /** Active persona (or the global default), with its soul decrypted. */
  getActivePersona(activePersonaId: string | null): Promise<Persona>;
  /** The launch_game catalog: exactly the games this kid may play. */
  loadGameCatalog(kidId: string): Promise<VoiceCatalogEntry[]>;
  /** The decrypted, kid-locale game row (throws when missing). */
  loadGameInfo(gameId: string, kidId?: string): Promise<ResolvedGameInfo>;
  /** Accepted friends' names (share_snapshot); best-effort, [] on failure. */
  loadFriendNames(kid: Kid): Promise<string[]>;
}

/**
 * Resolve the game info: from the row normally, from the context for snapshot
 * play. `kidId` scopes the read so the platform derives that child's locale for
 * system-game translations (and enforces visibility).
 */
export function resolveGameInfo(
  sources: Pick<VoiceSessionSources, "loadGameInfo">,
  ctx: GameSessionContextInput,
  kidId?: string,
): Promise<ResolvedGameInfo> {
  if (ctx.inline) {
    return Promise.resolve({
      title: ctx.inline.title,
      description: ctx.inline.description,
      markdown: ctx.markdown,
      codeBundle: ctx.codeBundle,
      capabilities: ctx.capabilities,
    });
  }
  return sources.loadGameInfo(ctx.gameId, kidId);
}

export async function buildHomeVoiceConfig(
  sources: VoiceSessionSources,
  kidId: string,
): Promise<VoiceSessionConfig> {
  const kid = await sources.loadKid(kidId);
  if (!kid) throw new Error("Kid not found");

  const voice = await sources.resolveVoice();
  const persona = await sources.getActivePersona(kid.active_persona?.id ?? null);
  const gameCatalog = await sources.loadGameCatalog(kidId);

  const { systemInstruction, tools } = buildHomeVoiceContext({
    personaSoul: persona.soul,
    personaName: persona.name,
    childName: kid.display_name,
    childBirthdate: kid.birthdate,
    childLanguage: kid.language,
    memory: kid.memory,
    parentNotes: kid.parent_notes,
    gameCatalog,
  });

  return {
    provider: voice.provider,
    apiKey: voice.apiKey,
    model: voice.model,
    voiceName: voice.voiceName,
    systemInstruction,
    ...(tools.length > 0 ? { tools } : {}),
    language: kid.language,
    isBirthday: isTodayBirthday(kid.birthdate),
  };
}

export async function buildGameVoiceConfig(
  sources: VoiceSessionSources,
  kidId: string,
  ctx: GameSessionContextInput,
): Promise<VoiceSessionConfig> {
  const kid = await sources.loadKid(kidId);
  if (!kid) throw new Error("Kid not found");

  const voice = await sources.resolveVoice();
  const persona = await sources.getActivePersona(kid.active_persona?.id ?? null);
  const info = await resolveGameInfo(sources, ctx, kidId);
  const friendNames = info.capabilities.includes("save_state")
    ? await sources.loadFriendNames(kid)
    : [];
  // Best-effort: the catalog only makes launch_game usable with real ids; a
  // failed library load must not keep the game session from connecting (the
  // guidance then documents the tool as library-only).
  const gameCatalog = await sources.loadGameCatalog(kidId).catch((): VoiceCatalogEntry[] => []);

  const { systemInstruction, tools } = buildGameVoiceContext({
    personaSoul: persona.soul,
    personaName: persona.name,
    childName: kid.display_name,
    childBirthdate: kid.birthdate,
    childLanguage: kid.language,
    memory: kid.memory,
    parentNotes: kid.parent_notes,
    gameTitle: info.title,
    gameDescription: info.description,
    gameMarkdown: info.markdown,
    gameCodeBundle: info.codeBundle,
    gameId: ctx.gameId,
    gameCatalog,
    gameState: ctx.gameState,
    capabilities: info.capabilities,
    friendNames,
  });

  return {
    provider: voice.provider,
    apiKey: voice.apiKey,
    model: voice.model,
    voiceName: voice.voiceName,
    systemInstruction,
    ...(tools.length > 0 ? { tools } : {}),
    language: kid.language,
    isBirthday: isTodayBirthday(kid.birthdate),
  };
}
