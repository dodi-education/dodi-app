/**
 * Export and import of `.dodi-game.zip` archives, entirely on the device: the
 * server never sees an archive.
 *
 * Export has two sources:
 * - `owned`: a private studio game, assembled from the decrypted vault cache.
 *   The studio conversation is opt-in (it can carry attached reference photos).
 * - `discover`: a published game, plaintext by design, fetched from the
 *   Discover detail endpoint and packed the same way, with no conversation.
 *
 * Import treats the archive as hostile: unzip + validate + sanitize
 * (`@dodi/games/export`), then seal everything under this account's vault and
 * create the game through the normal POST, inactive until the parent reviews
 * it. Bytes in, bytes out: clients adapt their own file pickers and downloads.
 */
import type { Json } from "@dodi/types/database";
import type { DiscoverGameDetail } from "@dodi/types/games";
import {
  type ExportableGame,
  type GameImportErrorCode,
  type ParsedGameExport,
  GameImportError,
  buildGameExportFiles,
  gameExportFileName,
  parseGameExportFiles,
} from "@dodi/games/export";
import { packGameExportZip, unpackGameExportZip } from "@dodi/games/export-zip";
import { UNBUILT_GAME_PLACEHOLDER } from "@dodi/games/placeholder";

import type { AudienceSelection } from "./game-sharing";
import type { GameCrypto, GameStore } from "./game-store";
import type { PlatformApi } from "./platform";
import type { VaultStore } from "./vault-store";

export type GameExportSource = "owned" | "discover";

export interface GameTransferDeps {
  api: PlatformApi;
  games: GameStore;
  gameCrypto: GameCrypto;
  vault: VaultStore;
}

/** A Discover detail as the export format's game shape. */
export function discoverDetailToExportable(detail: DiscoverGameDetail): ExportableGame {
  return {
    title: detail.title,
    description: detail.description,
    tags: detail.tags,
    learning_goal: detail.learning_goal,
    success_definition: detail.success_definition,
    success_criteria: detail.success_criteria,
    progress_kind: detail.progress_kind,
    target_age_min: detail.target_age_min,
    target_age_max: detail.target_age_max,
    estimated_duration_minutes: detail.estimated_duration_minutes,
    code_bundle: detail.code_bundle,
    markdown: detail.markdown,
    metadata: detail.metadata,
    preview_image: detail.preview_image,
  };
}

/**
 * An owned game's stored studio conversation, unsealed in the unlocked vault;
 * null when there is none, the vault is locked, or it can't be opened
 * (malformed / wrong key: export without it). Rejects when the game can't load.
 */
export async function loadExportTranscript(
  deps: Pick<GameTransferDeps, "games" | "vault">,
  gameId: string,
): Promise<unknown[] | null> {
  const game = await deps.games.getState().loadOne(gameId);
  const session = deps.vault.getState().session;
  if (!game?.agent_transcript_enc || !session) return null;
  try {
    const parsed = session.decryptJson<unknown[]>(game.agent_transcript_enc);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export interface GameExportArchive {
  /** The zip bytes. */
  bytes: Uint8Array;
  fileName: string;
}

/** Thrown when the game to export can't be loaded. */
export class GameExportLoadError extends Error {
  constructor() {
    super("Failed to load the game for export");
    this.name = "GameExportLoadError";
  }
}

/**
 * Build the export archive. Owned games are re-read (forced): the list cache
 * lacks ages/duration and may be stale. `transcript` is only packed for owned
 * games. Throws {@link GameExportLoadError} when the game can't load.
 */
export async function buildGameExportArchive(
  deps: Pick<GameTransferDeps, "api" | "games">,
  input: {
    gameId: string;
    source: GameExportSource;
    transcript: unknown[] | null;
    /** Recorded in the manifest (e.g. "dodi web"). */
    appVersion: string;
  },
): Promise<GameExportArchive> {
  let row: ExportableGame | null;
  if (input.source === "discover") {
    const res = await deps.api.request(`/api/discover/games/${input.gameId}`);
    if (!res.ok) throw new GameExportLoadError();
    row = discoverDetailToExportable((await res.json()) as DiscoverGameDetail);
  } else {
    row = await deps.games.getState().loadOne(input.gameId, undefined, true);
  }
  if (!row) throw new GameExportLoadError();
  const files = buildGameExportFiles({
    game: row,
    transcript: input.source === "owned" ? input.transcript : null,
    appVersion: input.appVersion,
  });
  return { bytes: packGameExportZip(files), fileName: gameExportFileName(row.title) };
}

/** `gameStudio` message key for each structured import-error code. */
export const IMPORT_ERROR_KEY_BY_CODE: Record<GameImportErrorCode, string> = {
  "archive-too-large": "importErrArchiveTooLarge",
  "archive-invalid": "importErrArchiveInvalid",
  "manifest-missing": "importErrManifest",
  "manifest-invalid": "importErrManifest",
  "unsupported-version": "importErrVersion",
  "code-missing": "importErrCode",
  "invalid-code": "importErrCode",
  "code-too-large": "importErrCodeTooLarge",
  "unsafe-code": "importErrUnsafeCode",
  "background-missing": "importErrBackground",
};

/** The `gameStudio` message key for an import parse failure. */
export function importErrorKey(error: unknown): string {
  return error instanceof GameImportError
    ? IMPORT_ERROR_KEY_BY_CODE[error.code]
    : "importErrArchiveInvalid";
}

/** Unzip and validate an untrusted archive (throws {@link GameImportError}). */
export function parseGameImportArchive(bytes: Uint8Array): ParsedGameExport {
  return parseGameExportFiles(unpackGameExportZip(bytes));
}

/**
 * The kid the import is created under: the first kid for "family", else the
 * first picked kid; null when there is none.
 */
export function importPrimaryKidId(
  selection: AudienceSelection,
  kidIds: string[],
): string | null {
  return selection.isFamily ? (kidIds[0] ?? null) : (selection.audienceIds[0] ?? null);
}

/**
 * Create the imported game: seal everything here (once it is ciphertext no
 * later layer can check it; an unbuilt archive gets the sealed placeholder),
 * re-seal an included conversation when the vault is unlocked, POST inactive
 * with the chosen audience. Resolves the new id; throws with the server's
 * error text (or `HTTP <status>`).
 */
export async function importGame(
  deps: GameTransferDeps,
  input: { parsed: ParsedGameExport; kidId: string; audience: AudienceSelection },
): Promise<string> {
  const { parsed, kidId, audience } = input;
  const { manifest } = parsed;
  const session = deps.vault.getState().session;
  const agentTranscriptEnc =
    parsed.transcript && session ? session.encryptJson(parsed.transcript) : undefined;
  const sealed = await deps.gameCrypto.sealGameCreateFields({
    title: manifest.title,
    description: manifest.description || undefined,
    markdown: parsed.markdown || undefined,
    codeBundle: parsed.unbuilt ? UNBUILT_GAME_PLACEHOLDER : parsed.codeBundle,
    learningGoal: manifest.learningGoal || undefined,
    successDefinition: manifest.successDefinition || undefined,
    successCriteria: Object.keys(manifest.successCriteria).length
      ? (manifest.successCriteria as unknown as Json)
      : undefined,
    previewImage: parsed.previewImageDataUrl || undefined,
  });
  const res = await deps.api.request("/api/games", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kidId,
      ...sealed,
      tags: parsed.tags,
      progressKind: manifest.progressKind,
      targetAgeMin: manifest.targetAgeMin,
      targetAgeMax: manifest.targetAgeMax,
      estimatedDurationMinutes: manifest.estimatedDurationMinutes,
      metadata: manifest.metadata,
      // Imported code stays inactive until the parent has reviewed it.
      isActive: false,
      agentTranscriptEnc,
      audience: { isFamily: audience.isFamily, audienceIds: audience.audienceIds },
    }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  const created = (await res.json()) as { id: string };
  deps.games.getState().invalidate();
  return created.id;
}
