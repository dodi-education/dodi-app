/**
 * The studio's settings save, minus the screen: map the success definition
 * on the device, seal the content fields, and PATCH an existing game or POST a
 * new one. Validation, the build handoff and navigation stay with the screen
 * (see settings-save.ts for the pure rules it follows).
 *
 * E2EE: title, learning goal, success definition and criteria, the code and
 * the transcript are sealed under the vault before they leave the device.
 */

import { mapSuccessDefinition } from "@dodi/ai/success-mapping";
import { UNBUILT_GAME_PLACEHOLDER } from "@dodi/games/placeholder";
import type { ProgressKind } from "@dodi/games/success";
import type { Game, Json } from "@dodi/types/database";
import {
  decryptGame,
  encryptGameCreateFields,
  encryptGameFields,
} from "@dodi/vault/game-crypto";

import type { StudioEditorPorts } from "./ports";
import { sendJson } from "./http";
import type { StudioGame } from "./studio-game";
import { sealTranscript, type StudioChatMessage } from "./transcript";

/** The awaited steps of a settings save, for a screen that traces a stalled save. */
export type SettingsSaveStep =
  | "resolve_game_model"
  | "map_success_definition"
  | "seal_fields"
  | "patch_game"
  | "decrypt_response";

export interface MappedCriteria {
  successCriteria: unknown;
  progressKind: ProgressKind;
}

/**
 * Map the success definition to structured criteria ON THE DEVICE (the
 * provider key stays in the vault); only the mapped result is sent. Null when
 * no provider is configured or the mapping failed: the save then persists the
 * text and leaves the existing criteria untouched.
 */
export async function mapSettingsSuccessDefinition(
  ports: Pick<StudioEditorPorts, "execution">,
  game: Pick<StudioGame, "successDefinition" | "learningGoal">,
  onStep?: (step: SettingsSaveStep) => void,
): Promise<MappedCriteria | null> {
  try {
    onStep?.("resolve_game_model");
    const gameCfg = await ports.execution.resolveGame();
    onStep?.("map_success_definition");
    const mapped = await mapSuccessDefinition(
      gameCfg
        ? { providerId: gameCfg.provider, modelId: gameCfg.model, apiKey: gameCfg.apiKey }
        : null,
      game.successDefinition,
      { learningGoal: game.learningGoal },
    );
    return { successCriteria: mapped.successCriteria, progressKind: mapped.progressKind };
  } catch {
    return null;
  }
}

export interface PatchGameSettingsOptions {
  /** From {@link mapSettingsSuccessDefinition}; null keeps the stored criteria. */
  mapped: MappedCriteria | null;
  /** This save ends planning: the Plan-step envelope (`plan_enc`) is cleared. */
  isEndingPlanning: boolean;
  onStep?: (step: SettingsSaveStep) => void;
}

/**
 * Save an existing game's settings. Returns the decrypted row, already put
 * into the game cache; throws with the server's reason on failure.
 */
export async function patchGameSettings(
  ports: Pick<StudioEditorPorts, "api" | "session" | "games">,
  gameId: string,
  game: StudioGame,
  { mapped, isEndingPlanning, onStep }: PatchGameSettingsOptions,
): Promise<Game> {
  onStep?.("seal_fields");
  const sealed = encryptGameFields(await ports.session(), {
    title: game.title || undefined,
    learning_goal: game.learningGoal,
    success_definition: game.successDefinition,
    ...(mapped ? { success_criteria: mapped.successCriteria as Json } : {}),
  });
  onStep?.("patch_game");
  const res = await sendJson(ports.api, `/api/games/${gameId}`, "PATCH", {
    ...sealed,
    tags: game.tags,
    target_age_min: game.targetAgeMin,
    target_age_max: game.targetAgeMax,
    ...(mapped ? { progress_kind: mapped.progressKind } : {}),
    is_active: game.isActive,
    // Shallow-merged server-side, so capabilities/drawingStyle survive.
    metadata: {
      perspective: game.perspective,
      generateBackgroundImage: game.generateBackgroundImage,
      generatePreviewImage: game.generatePreviewImage,
    },
    audience: { isFamily: game.isFamily, audienceIds: game.audienceIds },
    // Saving the settings ends planning: the envelope goes, the row becomes a
    // plain draft (or, with an accepted plan, a build).
    ...(isEndingPlanning ? { plan_enc: null } : {}),
  });
  onStep?.("decrypt_response");
  const row = decryptGame(await ports.session(), (await res.json()) as Game);
  ports.games.put(row);
  return row;
}

export interface CreateGameFromSettingsInput {
  /** The kid that owns the row (the primary audience kid; the screen validates it is set). */
  kidId: string | null;
  game: StudioGame;
  /** The thread so far (the Plan conversation), sealed onto the new row. */
  transcript: StudioChatMessage[];
}

/**
 * Persist a new game straight from settings (no build required). With no code
 * yet the placeholder is sealed here: the server can't write plaintext into an
 * encrypted column, and only the device can read the marker back to tell
 * "unbuilt" from a real game. Returns the new id; the game cache is
 * invalidated so lists pick the row up.
 */
export async function createGameFromSettings(
  ports: Pick<StudioEditorPorts, "api" | "session" | "currentSession" | "games">,
  { kidId, game, transcript }: CreateGameFromSettingsInput,
): Promise<string> {
  const sealed = encryptGameCreateFields(await ports.session(), {
    title: game.title.trim(),
    learningGoal: game.learningGoal || undefined,
    successDefinition: game.successDefinition || undefined,
    codeBundle: game.codeBundle || UNBUILT_GAME_PLACEHOLDER,
  });
  // The Plan conversation is already worth keeping: seal it onto the new row
  // so a reload shows what was discussed, not an empty thread.
  const session = ports.currentSession();
  const planTranscript = session ? sealTranscript(session, transcript) : null;
  const res = await sendJson(ports.api, "/api/games", "POST", {
    kidId,
    ...sealed,
    tags: game.tags,
    targetAgeMin: game.targetAgeMin,
    targetAgeMax: game.targetAgeMax,
    progressKind: game.successDefinition.trim() ? "goal" : "open",
    // Playable only once real code exists; an unbuilt draft is not.
    isActive: Boolean(game.codeBundle),
    metadata: {
      perspective: game.perspective,
      generateBackgroundImage: game.generateBackgroundImage,
      generatePreviewImage: game.generatePreviewImage,
    },
    audience: { isFamily: game.isFamily, audienceIds: game.audienceIds },
    ...(planTranscript ? { agentTranscriptEnc: planTranscript } : {}),
  });
  const data = (await res.json()) as { id: string };
  ports.games.invalidate();
  return data.id;
}
