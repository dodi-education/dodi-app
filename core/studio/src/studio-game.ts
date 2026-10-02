/**
 * The Game Studio editor's game: the build baseline plus the editor's own
 * fields, all plaintext (decrypted on the device). Shared by the web studio
 * and the mobile app so both open, edit and save the same shape.
 */

import { coerceSuccessCriteria } from "@dodi/games/game-spec";

import type { StudioBuildGame } from "./build-runner";

/** The studio's game: the build baseline (`StudioBuildGame`) plus the editor's own fields. */
export interface StudioGame extends StudioBuildGame {
  id: string | null;
  /** Recommended player age range — a plaintext facet shown on dodi Discover. */
  targetAgeMin: number;
  targetAgeMax: number;
  /** Head of the game's version chain (server-managed); null = pre-versioning code. */
  currentGameVersionId: string | null;
  /** Playable by kids. Parent-created games start inactive until activated. */
  isActive: boolean;
  /** enc:v1: sealed prior studio conversation, restored on re-entry. */
  agentTranscriptEnc?: string | null;
  /** enc:v1: sealed Plan-step state; set while the game is still being planned. */
  planEnc?: string | null;
}

/** The stage's three tabs. Doubles as the `/game-studio/{id}/{tab}` segment. */
export type StudioView = "settings" | "code" | "preview";

export const STUDIO_VIEWS: readonly StudioView[] = ["settings", "code", "preview"];

export function isStudioView(value: string | undefined): value is StudioView {
  return value !== undefined && STUDIO_VIEWS.includes(value as StudioView);
}

/** A brand-new game, before the parent has planned or saved anything. */
export function emptyStudioGame(): StudioGame {
  return {
    id: null,
    title: "",
    tags: [],
    description: "",
    learningGoal: "",
    successDefinition: "",
    progressKind: "open",
    successCriteria: coerceSuccessCriteria(undefined),
    // Match the server's default recommended range for new games (games.ts).
    targetAgeMin: 4,
    targetAgeMax: 12,
    codeBundle: "",
    currentGameVersionId: null,
    markdown: "",
    audienceIds: [],
    // New games default to the whole family; parents narrow this if they want.
    isFamily: true,
    built: false,
    isActive: false,
    perspective: null,
    generateBackgroundImage: false,
    generatePreviewImage: false,
    capabilities: [],
    previewImage: null,
  };
}

/**
 * The kid whose context a studio action uses: the first kid of the family for
 * a family game, else the first picked audience kid.
 */
export function resolvePrimaryKidId(
  game: Pick<StudioGame, "isFamily" | "audienceIds">,
  kids: ReadonlyArray<{ id: string }>,
): string | null {
  return game.isFamily ? (kids[0]?.id ?? null) : (game.audienceIds[0] ?? null);
}
