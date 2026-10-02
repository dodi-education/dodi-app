/**
 * Small Game Studio editor actions on the persisted game row: the sealed
 * conversation, the active toggle, and the provider check that gates the
 * composer. The screens own their state; these own the platform calls and
 * the sealing.
 */

import type { StudioEditorPorts } from "./ports";
import { sendJson } from "./http";
import { sealTranscript, type StudioChatMessage } from "./transcript";

/**
 * Persist the (sealed) conversation alongside the game. `null` or an empty
 * thread clears it. While the vault is locked nothing can be sealed, so the
 * persisted copy is cleared rather than written in plaintext. Best effort:
 * the response is not checked.
 */
export async function persistTranscript(
  ports: Pick<StudioEditorPorts, "api" | "currentSession">,
  gameId: string,
  transcript: StudioChatMessage[] | null,
): Promise<void> {
  const session = ports.currentSession();
  const agent_transcript_enc = session ? sealTranscript(session, transcript) : null;
  await ports.api.request(`/api/games/${gameId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent_transcript_enc }),
  });
}

/**
 * Flip a game's active state. Optimistic: the game cache (which the kid
 * library reads) flips first, and flips back when the PATCH fails, which then
 * rethrows with the server's reason.
 */
export async function setGameActive(
  ports: Pick<StudioEditorPorts, "api" | "games">,
  gameId: string,
  isActive: boolean,
): Promise<void> {
  ports.games.patchLocal(gameId, { is_active: isActive });
  try {
    await sendJson(ports.api, `/api/games/${gameId}`, "PATCH", { is_active: isActive });
  } catch (err) {
    ports.games.patchLocal(gameId, { is_active: !isActive });
    throw err;
  }
}

export interface StudioProviderCheck {
  /** An explicit game (thinking) model is configured: builds and plan turns can run. */
  hasGameProvider: boolean;
  /** An image model is configured AND its vault key is available. */
  hasImageProvider: boolean;
}

/**
 * Which AI the studio can use. A build needs an explicitly configured game
 * model (the voice model alone can't drive the agent); background/preview
 * image generation needs an image model with its key. Any failure reads as
 * "not configured". `onGameProvider` fires as soon as the game half is known,
 * before the (slower) image key resolution.
 */
export async function checkStudioProviders(
  ports: Pick<StudioEditorPorts, "api" | "execution">,
  onGameProvider?: (hasGameProvider: boolean) => void,
): Promise<StudioProviderCheck> {
  try {
    const res = await ports.api.request("/api/ai/config");
    if (!res.ok) return { hasGameProvider: false, hasImageProvider: false };
    const cfg = (await res.json()) as { gameProvider?: string } | null;
    const hasGameProvider = Boolean(cfg?.gameProvider);
    onGameProvider?.(hasGameProvider);
    // Full check incl. vault key (the resolver re-reads the config).
    const image = await ports.execution.resolveImage().catch(() => null);
    return { hasGameProvider, hasImageProvider: Boolean(image) };
  } catch {
    return { hasGameProvider: false, hasImageProvider: false };
  }
}
