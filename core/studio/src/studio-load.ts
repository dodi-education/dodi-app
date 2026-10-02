/**
 * Opening a saved game in the studio: the decrypted row plus its sharing,
 * turned into the editor's plaintext `StudioGame`. Shared by the web route
 * (`/parent/game-studio/{id}`) and the mobile app's, so both open the same shape.
 */

import { coerceProgressKind, coerceSuccessCriteria } from "@dodi/games/game-spec";
import { isUnbuiltBundle } from "@dodi/games/placeholder";
import type { Game } from "@dodi/types/database";
import type { GameMetadata } from "@dodi/types/games";

import type { StudioApi } from "./ports";
import type { StudioGame } from "./studio-game";

/** Who a game is shared with (`GET /api/games/{id}/sharing`). */
export interface StudioGameSharing {
  family: boolean;
  kidIds: string[];
}

const NO_SHARING: StudioGameSharing = { family: false, kidIds: [] };

/**
 * The editor's game from a decrypted row. The audience is the family, else
 * the kids it is shared with, else the kid the row belongs to.
 */
export function studioGameFromRow(game: Game, sharing: StudioGameSharing): StudioGame {
  const audienceIds = sharing.family
    ? []
    : sharing.kidIds.length > 0
      ? sharing.kidIds
      : game.kid_id
        ? [game.kid_id]
        : [];
  const metadata = (game.metadata ?? {}) as GameMetadata;
  return {
    id: game.id,
    title: game.title,
    tags: game.tags,
    description: game.description,
    learningGoal: game.learning_goal,
    successDefinition: game.success_definition,
    progressKind: coerceProgressKind(game.progress_kind),
    successCriteria: coerceSuccessCriteria(game.success_criteria),
    targetAgeMin: game.target_age_min,
    targetAgeMax: game.target_age_max,
    codeBundle: game.code_bundle,
    currentGameVersionId: game.current_game_version_id,
    markdown: game.markdown,
    audienceIds,
    isFamily: sharing.family,
    // "Built" once dodi has replaced the unbuilt placeholder with real code.
    built: !isUnbuiltBundle(game.code_bundle),
    isActive: game.is_active,
    perspective: metadata.perspective ?? null,
    generateBackgroundImage: Boolean(metadata.generateBackgroundImage),
    generatePreviewImage: Boolean(metadata.generatePreviewImage),
    capabilities: metadata.capabilities ?? [],
    previewImage: game.preview_image,
    // Sealed prior conversation: the studio unseals it to resume editing.
    agentTranscriptEnc: game.agent_transcript_enc,
    // Sealed Plan-step state: set while the game is still being planned.
    planEnc: game.plan_enc,
  };
}

export interface LoadStudioGameDeps {
  api: StudioApi;
  /** The decrypted row from the client's game cache (null when missing). */
  loadGame(id: string): Promise<Game | null>;
  /** The signed-in account's id (null when signed out). */
  sessionUserId(): Promise<string | null>;
}

/**
 * Load a game for the studio. Null when it is missing or not the signed-in
 * account's own (system games and other families' games are not editable).
 * Rejects when loading fails; callers treat that like a missing game.
 */
export async function loadStudioGame(
  deps: LoadStudioGameDeps,
  id: string,
): Promise<StudioGame | null> {
  const [userId, game, sharingRes] = await Promise.all([
    deps.sessionUserId(),
    deps.loadGame(id),
    deps.api.request(`/api/games/${id}/sharing`),
  ]);
  if (!game || !userId || game.account_id !== userId) return null;
  const sharing = sharingRes.ok ? ((await sharingRes.json()) as StudioGameSharing) : NO_SHARING;
  return studioGameFromRow(game, sharing);
}
