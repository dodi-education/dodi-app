/**
 * The studio conversation: what the parent and dodi said, shown as the chat
 * thread and sealed onto the game row (`agent_transcript_enc`) so the next
 * session picks up where the last one left off.
 */

import type { PriorTurn } from "@dodi/ai/game-agent";
import type { VaultSession } from "@dodi/vault";

import { type AgentRunLog, boundRunLogs, restoreRunLog } from "./agent-run-log";

export interface StudioChatMessage {
  role: "user" | "assistant";
  text: string;
  /** Attached reference images (downscaled data URLs) on user turns. */
  images?: string[];
  /** Assistant turns whose build changed the code — anchors Show changes | Revert. */
  hasCodeChange?: boolean;
  /** What the game agent did for this reply (display only, never fed to the model). */
  run?: AgentRunLog;
}

/** Sealed-transcript guard: only this many trailing messages keep their images. */
export const TRANSCRIPT_IMAGE_MESSAGES = 6;

/** Prior turns for the model: text and images only, never a run log. */
export function toPriorTurns(history: StudioChatMessage[]): PriorTurn[] {
  return history.map((m) => ({
    role: m.role,
    text: m.text,
    ...(m.images?.length ? { images: m.images } : {}),
  }));
}

/**
 * Keep the sealed transcript bounded: images beyond the trailing window are
 * display-only history nobody re-feeds — drop them from the sealed copy so
 * agent_transcript_enc doesn't grow by hundreds of KB per attachment forever.
 * Run logs are bounded the same way: only the trailing runs keep their
 * (thumbnail) frames, and full-size captures never leave the session.
 */
export function sealableTranscript(transcript: StudioChatMessage[]): StudioChatMessage[] {
  return boundRunLogs(transcript).map((m, i) =>
    m.images?.length && i < transcript.length - TRANSCRIPT_IMAGE_MESSAGES
      ? { ...m, images: undefined }
      : m,
  );
}

/** Seal a transcript for the game row; an empty one clears it (null). */
export function sealTranscript(
  session: VaultSession,
  transcript: StudioChatMessage[] | null,
): string | null {
  return transcript && transcript.length > 0
    ? session.encryptJson(sealableTranscript(transcript))
    : null;
}

/** Unseal a persisted transcript; a malformed one or the wrong key yields []. */
export function restoreTranscript(
  session: VaultSession | null,
  enc: string | null | undefined,
): StudioChatMessage[] {
  if (!enc || !session) return [];
  try {
    const restored = session.decryptJson<StudioChatMessage[]>(enc);
    if (!Array.isArray(restored)) return [];
    // Transcripts sealed before run logs existed simply have no `run`.
    return restored.map(({ run, ...m }) => {
      const restoredRun = restoreRunLog(run);
      return restoredRun ? { ...m, run: restoredRun } : m;
    });
  } catch {
    // malformed / wrong key — start clean
    return [];
  }
}
