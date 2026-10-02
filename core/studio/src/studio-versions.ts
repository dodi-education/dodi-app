/**
 * The studio's version history: the lean list, a version's code (the diff
 * base), switching the head to an existing version, and the parent's manual
 * code edit. Code is E2EE: it is sanitized and sealed on the device before it
 * leaves, and opened on the device when it comes back.
 */

import { sanitizeGameBundle } from "@dodi/games/sanitizer";
import type { Game, GameVersion } from "@dodi/types/database";
import { decryptGame, decryptGameVersion, encryptGameFields } from "@dodi/vault/game-crypto";

import type { StudioEditorPorts } from "./ports";
import { sendJson } from "./http";

/** Lean version-history entry from GET /api/games/[id]/versions (no code). */
export interface GameVersionEntry {
  id: string;
  previous_game_version_id: string | null;
  created_at: string;
}

/**
 * The lean version list, newest first. Null when it can't be loaded: history
 * is non-critical chrome, the studio works without it.
 */
export async function listGameVersions(
  ports: Pick<StudioEditorPorts, "api">,
  gameId: string,
): Promise<GameVersionEntry[] | null> {
  try {
    const res = await ports.api.request(`/api/games/${gameId}/versions`);
    if (!res.ok) return null;
    const data = (await res.json()) as { versions: GameVersionEntry[] };
    return data.versions;
  } catch {
    return null;
  }
}

/** One version's code, opened on the device; null when unavailable (the diff just stays off). */
export async function loadVersionCode(
  ports: Pick<StudioEditorPorts, "api" | "session">,
  gameId: string,
  versionId: string,
): Promise<string | null> {
  try {
    const res = await ports.api.request(`/api/games/${gameId}/versions/${versionId}`);
    if (!res.ok) return null;
    const row = decryptGameVersion(await ports.session(), (await res.json()) as GameVersion);
    return row.code_bundle;
  } catch {
    return null;
  }
}

/**
 * Switch the game to an existing version: the server copies that version's
 * code into the game and moves the head pointer (no new version row). Returns
 * the decrypted row, already put into the game cache; throws with the
 * server's reason on failure.
 */
export async function restoreGameVersion(
  ports: Pick<StudioEditorPorts, "api" | "session" | "games">,
  gameId: string,
  versionId: string,
): Promise<Game> {
  const res = await sendJson(ports.api, `/api/games/${gameId}`, "PATCH", {
    restore_version_id: versionId,
  });
  const row = decryptGame(await ports.session(), (await res.json()) as Game);
  ports.games.put(row);
  return row;
}

/**
 * Save hand-edited code: sanitize it BEFORE sealing (once encrypted, no later
 * layer can inspect it), then PATCH either as a new version or over the head.
 * Returns the decrypted row, already put into the game cache.
 */
export async function saveCodeEdit(
  ports: Pick<StudioEditorPorts, "api" | "session" | "games">,
  gameId: string,
  code: string,
  options: { isNewVersion: boolean },
): Promise<Game> {
  const safeCode = sanitizeGameBundle(code).code;
  const session = await ports.session();
  const sealed = encryptGameFields(session, { code_bundle: safeCode });
  const res = await sendJson(ports.api, `/api/games/${gameId}`, "PATCH", {
    ...sealed,
    create_version: options.isNewVersion,
  });
  const row = decryptGame(await ports.session(), (await res.json()) as Game);
  ports.games.put(row);
  return row;
}
