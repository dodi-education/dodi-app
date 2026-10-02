/**
 * The companion's data loaders over the shared stores: the decrypted kid,
 * persona, games and friends, plus the voice provider resolved with its
 * vault/managed key. Everything decrypts on the device; the server only ever
 * sees ciphertext and never a provider key. Feeds the voice-session builders
 * (`@dodi/ai/voice/session-config`), the memory update and the in-game text
 * assistant.
 */
import type {
  ResolvedGameInfo,
  ResolvedVoice,
  VoiceCatalogEntry,
  VoiceSessionSources,
} from "@dodi/ai/voice/session-config";
import type { AccountModelConfig } from "@dodi/types/ai";
import type { Kid, Persona } from "@dodi/types/database";
import type { GameMetadata } from "@dodi/types/games";
import { decryptPersona, type VaultSession } from "@dodi/vault";

import { decodeView, ensureFriendKeys, fetchFriends } from "./friends";
import type { GameStore } from "./game-store";
import type { KidStore } from "./kid-store";
import type { PlatformApi } from "./platform";
import type { ExecutionResolver } from "./resolve-execution";
import type { VaultStore } from "./vault-store";

export interface CompanionSourceDeps {
  api: PlatformApi;
  kids: Pick<KidStore, "getState">;
  games: Pick<GameStore, "getState">;
  vault: Pick<VaultStore, "getState">;
  execution: Pick<ExecutionResolver, "resolveExecution" | "resolveThinking">;
}

export interface CompanionSources extends VoiceSessionSources {
  getSession(): VaultSession | null;
  /** The account's plaintext model selection (provider/model per category). */
  getModelConfig(): Promise<AccountModelConfig>;
}

export function createCompanionSources(deps: CompanionSourceDeps): CompanionSources {
  const { api } = deps;
  const getSession = (): VaultSession | null => deps.vault.getState().session;

  const getModelConfig = async (): Promise<AccountModelConfig> => {
    const res = await api.request("/api/ai/config");
    if (!res.ok) throw new Error("No AI provider configured");
    const cfg = (await res.json()) as AccountModelConfig | null;
    if (!cfg) throw new Error("No AI provider configured");
    return cfg;
  };

  return {
    getSession,
    getModelConfig,

    loadKid: (kidId) => deps.kids.getState().loadOne(kidId),

    /**
     * Voice provider/model/voice/key, with "dodi" mapped to its real upstream
     * and the "default" model sentinel resolved. The returned provider is
     * always a real one; the voice client factory never sees "dodi".
     */
    resolveVoice: async (): Promise<ResolvedVoice> => {
      const config = await getModelConfig();
      const resolved = await deps.execution.resolveExecution({
        provider: config.voiceProvider,
        category: "voice",
        model: config.voiceModel,
        voiceName: config.voiceName,
      });
      if (!resolved) {
        throw new Error(`No API key configured for ${config.voiceProvider}`);
      }
      return {
        provider: resolved.provider,
        model: resolved.model,
        voiceName: resolved.voiceName ?? config.voiceName,
        apiKey: resolved.apiKey,
      };
    },

    getActivePersona: async (activePersonaId): Promise<Persona> => {
      const res = await api.request("/api/personas");
      if (!res.ok) throw new Error("Failed to load persona");
      const personas = (await res.json()) as Persona[];
      const persona =
        (activePersonaId ? personas.find((p) => p.id === activePersonaId) : null) ??
        personas.find((p) => p.is_system_default) ??
        personas[0];
      if (!persona) throw new Error("No persona available");
      const session = getSession();
      if (!session) throw new Error("Vault is locked");
      return decryptPersona(session, persona);
    },

    /**
     * Titles are E2EE, so the catalog can only be assembled from the decrypted
     * cache, which is also why it is scoped to the kid: exactly what that
     * child is allowed to play.
     */
    loadGameCatalog: async (kidId): Promise<VoiceCatalogEntry[]> => {
      const games = await deps.games.getState().loadForKid(kidId);
      return games.map((g) => ({
        id: g.id,
        title: g.title,
        description: g.description,
        tags: g.tags,
      }));
    },

    loadGameInfo: async (gameId, kidId): Promise<ResolvedGameInfo> => {
      // Decrypted by the game cache: the whole prompt (briefing and the full
      // source bundle) is plaintext only on this device.
      const game = await deps.games.getState().loadOne(gameId, kidId);
      if (!game) throw new Error("Game not found");
      return {
        title: game.title,
        description: game.description,
        markdown: game.markdown ?? "",
        codeBundle: game.code_bundle,
        capabilities: (game.metadata as unknown as GameMetadata | null)?.capabilities ?? [],
      };
    },

    /**
     * Decrypted names of the kid's ACCEPTED friends, for the share_snapshot
     * flow. Best-effort: any failure (locked vault, no keys, network) returns
     * []; the session must still connect, sharing is just hidden.
     */
    loadFriendNames: async (kid: Kid): Promise<string[]> => {
      try {
        const session = getSession();
        if (!session) return [];
        const keys = await ensureFriendKeys(api, kid, session);
        const views = await fetchFriends(api, kid.id);
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
    },
  };
}
