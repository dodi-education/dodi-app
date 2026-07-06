/**
 * Client-side in-game text assistant (E2EE). Mirrors the in-game voice companion
 * (`buildGameVoiceConfig`): loads the vault-decrypted kid + persona, fetches
 * the language-translated game, resolves the vault-held thinking key, builds the
 * system instruction with the browser-safe `buildGameTextContext`, and calls the
 * thinking provider directly from the browser. The server never sees the child's
 * data, the persona soul, or the provider key.
 */
import { dodi } from "@/lib/api";
import { createClientThinkingProvider } from "@dodi/ai/client-thinking";
import { resolveClientThinking } from "@/lib/ai/resolve-client-thinking";
import { getActivePersona } from "@/lib/ai/voice-session";
import { normalizeCommands } from "@dodi/games/normalize-commands";
import { buildGameTextContext } from "@dodi/ai/dodi-context";
import { useKidStore } from "@/stores/kid-store";
import type { Game } from "@dodi/types/database";
import type { GameAssistantResponse, GameMetadata } from "@dodi/types/games";

export async function runGameTextAssistant(
  kidId: string,
  gameId: string,
  message: string,
  gameState: Record<string, unknown>,
): Promise<GameAssistantResponse> {
  const kid = await useKidStore.getState().loadOne(kidId);
  if (!kid) throw new Error("Kid not found");

  // Thinking provider/model + vault-decrypted key (never the voice model).
  const thinking = await resolveClientThinking();
  if (!thinking) throw new Error("No AI provider key configured");

  const persona = await getActivePersona(kid.active_persona_id);

  // Locale-translated game (title/description) — matches the old server route.
  const gameRes = await dodi.request(`/api/games/${gameId}?locale=${kid.language}`);
  if (!gameRes.ok) throw new Error("Game not found");
  const game = (await gameRes.json()) as Game;
  const capabilities =
    (game.metadata as unknown as GameMetadata | null)?.capabilities ?? [];

  const { systemInstruction } = buildGameTextContext({
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

  const provider = createClientThinkingProvider(
    thinking.provider,
    thinking.apiKey,
    thinking.model,
  );
  const parsed = await provider.generateJson(systemInstruction, message);

  const reply =
    typeof parsed.reply === "string" && parsed.reply.trim().length > 0
      ? parsed.reply.trim()
      : "Let me help you with that!";
  const commands = normalizeCommands(parsed.commands);

  return { reply, commands };
}
