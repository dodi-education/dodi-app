/**
 * Client-side in-game text assistant (E2EE). Mirrors the in-game voice companion
 * (`buildGameVoiceConfig`): loads the vault-decrypted profile + persona, fetches
 * the language-translated game, resolves the vault-held thinking key, builds the
 * system instruction with the browser-safe `buildGameTextContext`, and calls the
 * thinking provider directly from the browser. The server never sees the child's
 * data, the persona soul, or the provider key.
 */
import { createClientThinkingProvider } from "@/lib/ai/client-thinking";
import { resolveClientThinking } from "@/lib/ai/resolve-client-thinking";
import { getActivePersona } from "@/lib/ai/voice-session";
import { normalizeCommands } from "@/lib/games/normalize-commands";
import { buildGameTextContext } from "@/lib/services/dodi-context";
import { useProfileStore } from "@/stores/profile-store";
import type { Game } from "@/types/database";
import type { GameAssistantResponse } from "@/types/games";

export async function runGameTextAssistant(
  profileId: string,
  gameId: string,
  message: string,
  gameState: Record<string, unknown>,
): Promise<GameAssistantResponse> {
  const profile = await useProfileStore.getState().loadOne(profileId);
  if (!profile) throw new Error("Profile not found");

  // Thinking provider/model + vault-decrypted key (never the voice model).
  const thinking = await resolveClientThinking();
  if (!thinking) throw new Error("No AI provider key configured");

  const persona = await getActivePersona(profile.active_persona_id);

  // Locale-translated game (title/description) — matches the old server route.
  const gameRes = await fetch(`/api/games/${gameId}?locale=${profile.language}`);
  if (!gameRes.ok) throw new Error("Game not found");
  const game = (await gameRes.json()) as Game;

  const { systemInstruction } = buildGameTextContext({
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
