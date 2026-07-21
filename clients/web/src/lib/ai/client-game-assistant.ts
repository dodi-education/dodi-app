/**
 * Client-side in-game text assistant (E2EE). Mirrors the in-game voice companion
 * (`buildGameVoiceConfig`): loads the vault-decrypted kid + persona, fetches
 * the language-translated game, resolves the vault-held thinking key, builds the
 * system instruction with the browser-safe `buildGameTextContext`, and calls the
 * thinking provider directly from the browser. The server never sees the child's
 * data, the persona soul, or the provider key.
 */
import { createClientThinkingProvider } from "@dodi/ai/client-thinking";
import { reportUsage } from "@/lib/usage/report-usage";
import { resolveClientThinking } from "@/lib/ai/resolve-client-thinking";
import {
  getActivePersona,
  loadFriendNames,
  resolveGameInfo,
  type GameSessionContextInput,
} from "@/lib/ai/voice-session";
import { normalizeCommands } from "@dodi/games/normalize-commands";
import { buildGameTextContext } from "@dodi/ai/dodi-context";
import { useKidStore } from "@/stores/kid-store";
import type { GameAssistantResponse } from "@dodi/types/games";

export async function runGameTextAssistant(
  kidId: string,
  ctx: GameSessionContextInput & { snapshotId?: string },
  message: string,
): Promise<GameAssistantResponse> {
  const kid = await useKidStore.getState().loadOne(kidId);
  if (!kid) throw new Error("Kid not found");

  // Thinking provider/model + vault-decrypted key (never the voice model).
  const thinking = await resolveClientThinking();
  if (!thinking) throw new Error("No AI provider key configured");

  const persona = await getActivePersona(kid.active_persona?.id ?? null);

  // Decrypted, locale-translated game (the kid scope drives both) — or the
  // inline info for snapshot play, where the game row may be deleted or
  // another family's.
  const info = await resolveGameInfo(ctx, kid.id);
  const friendNames = info.capabilities.includes("save_state")
    ? await loadFriendNames(kid)
    : [];

  const { systemInstruction } = buildGameTextContext({
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

  const provider = createClientThinkingProvider(
    thinking.provider,
    thinking.apiKey,
    thinking.model,
    (usage) =>
      reportUsage({
        eventType: "game_analysis",
        kidId,
        // usage rows FK games — snapshot sessions attribute to no game.
        gameId: ctx.snapshotId ? null : ctx.gameId,
        provider: thinking.provider,
        model: thinking.model,
        usage,
        meta: {
          personaChars: persona.soul.length,
          memoryChars: (kid.memory ?? "").length,
          parentNotesChars: (kid.parent_notes ?? "").length,
          promptChars: message.length,
        },
      }),
  );
  const parsed = await provider.generateJson(systemInstruction, message);

  const reply =
    typeof parsed.reply === "string" && parsed.reply.trim().length > 0
      ? parsed.reply.trim()
      : "Let me help you with that!";
  const commands = normalizeCommands(parsed.commands);

  return { reply, commands };
}
