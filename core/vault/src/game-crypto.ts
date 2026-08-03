/**
 * Client-side encrypt/decrypt for a game's content fields, via a VaultSession.
 *
 * Encrypted: title, description, code_bundle, markdown, learning_goal,
 * success_definition, success_criteria and preview_image — sealed under the
 * account VMK so the server stays blind. `game_versions.code_bundle` inherits
 * the state for free: the service copies `games.code_bundle` verbatim into the
 * history, so ciphertext in means ciphertext stored.
 *
 * ONE predicate decides everything (see {@link isEncryptableGame}):
 *
 *   a row is PLAINTEXT iff  is_system  OR  publication_requested_at != null
 *
 * System games are shared, built-in content with no per-account key. Publication
 * copies are deliberately plaintext: publishing is a voluntary disclosure, and a
 * review agent has to be able to read the submission before it goes public. The
 * parent's own row is never decrypted — requesting publication forks a separate
 * copy (see the platform's game-publications service).
 *
 * Decryption needs no predicate at all: `decryptField` passes non-`enc:v1:`
 * values through unchanged, so {@link decryptGame} is safe on system rows,
 * publication copies and legacy rows written before encryption alike. Those
 * legacy rows seal themselves the next time they are saved.
 *
 * Operational columns (tags, ages, duration, progress_kind, metadata) stay
 * plaintext — they are the filter/routing metadata a blob store is allowed to
 * see, same rule as kids.social_id.
 */
import type { Game, GameVersion, Json } from "@dodi/types/database";

import type { VaultSession } from "./session";

export function isEncryptableGame(
  game: Pick<Game, "is_system" | "publication_requested_at">,
): boolean {
  return !game.is_system && game.publication_requested_at == null;
}

/** Decrypt a fetched game row for display, play, editing or export. */
export function decryptGame(session: VaultSession, row: Game): Game {
  return {
    ...row,
    title: session.decryptField(row.title) ?? "",
    description: session.decryptField(row.description) ?? "",
    code_bundle: session.decryptField(row.code_bundle) ?? "",
    markdown: session.decryptField(row.markdown) ?? "",
    learning_goal: session.decryptField(row.learning_goal) ?? "",
    success_definition: session.decryptField(row.success_definition) ?? "",
    success_criteria: decryptCriteria(session, row.success_criteria),
    preview_image: session.decryptField(row.preview_image),
  };
}

/** Decrypt a version-history row (diff / restore preview). */
export function decryptGameVersion(
  session: VaultSession,
  row: GameVersion,
): GameVersion {
  return { ...row, code_bundle: session.decryptField(row.code_bundle) ?? "" };
}

/**
 * `success_criteria` is a jsonb column holding an `enc:v1:` string scalar when
 * sealed; decrypt it back to the criteria object. `null` and plain objects
 * (system games, publication copies, legacy rows) pass through unchanged.
 * Mirrors `decryptAvatarConfig` in ./kid-crypto.
 */
function decryptCriteria(session: VaultSession, raw: Json | null): Json | null {
  if (raw == null) return null;
  if (typeof raw === "string") return session.decryptJson<Json>(raw);
  return raw;
}

/** snake_case content fields, as sent to PATCH /api/games/[id]. */
export interface GameContentFields {
  title?: string;
  description?: string;
  code_bundle?: string;
  markdown?: string;
  learning_goal?: string;
  success_definition?: string;
  /** Plain criteria object in; sealed `enc:v1:` JSON string out. */
  success_criteria?: Json | null;
  preview_image?: string | null;
}

/**
 * Encrypt the present content fields of an update payload. Only fields that are
 * present and a string (or, for success_criteria, a non-null object) are sealed;
 * absent / null pass through, so a partial PATCH stays partial.
 */
export function encryptGameFields<T extends GameContentFields>(
  session: VaultSession,
  fields: T,
): T {
  const out: T = { ...fields };
  if (typeof out.title === "string") out.title = session.encryptField(out.title);
  if (typeof out.description === "string") {
    out.description = session.encryptField(out.description);
  }
  if (typeof out.code_bundle === "string") {
    out.code_bundle = session.encryptField(out.code_bundle);
  }
  if (typeof out.markdown === "string") {
    out.markdown = session.encryptField(out.markdown);
  }
  if (typeof out.learning_goal === "string") {
    out.learning_goal = session.encryptField(out.learning_goal);
  }
  if (typeof out.success_definition === "string") {
    out.success_definition = session.encryptField(out.success_definition);
  }
  if (out.success_criteria != null && typeof out.success_criteria === "object") {
    out.success_criteria = session.encryptJson(out.success_criteria);
  }
  if (typeof out.preview_image === "string") {
    out.preview_image = session.encryptField(out.preview_image);
  }
  return out;
}

/** camelCase content fields, as sent to POST /api/games. */
export interface GameCreateFields {
  title?: string;
  description?: string;
  codeBundle?: string;
  markdown?: string;
  learningGoal?: string;
  successDefinition?: string;
  successCriteria?: Json | null;
  previewImage?: string | null;
}

/** {@link encryptGameFields} for the create route's camelCase body. */
export function encryptGameCreateFields<T extends GameCreateFields>(
  session: VaultSession,
  fields: T,
): T {
  const out: T = { ...fields };
  if (typeof out.title === "string") out.title = session.encryptField(out.title);
  if (typeof out.description === "string") {
    out.description = session.encryptField(out.description);
  }
  if (typeof out.codeBundle === "string") {
    out.codeBundle = session.encryptField(out.codeBundle);
  }
  if (typeof out.markdown === "string") {
    out.markdown = session.encryptField(out.markdown);
  }
  if (typeof out.learningGoal === "string") {
    out.learningGoal = session.encryptField(out.learningGoal);
  }
  if (typeof out.successDefinition === "string") {
    out.successDefinition = session.encryptField(out.successDefinition);
  }
  if (out.successCriteria != null && typeof out.successCriteria === "object") {
    out.successCriteria = session.encryptJson(out.successCriteria);
  }
  if (typeof out.previewImage === "string") {
    out.previewImage = session.encryptField(out.previewImage);
  }
  return out;
}

/**
 * The decrypted content of a private game, as submitted for publication. The
 * client decrypts and posts this; the server persists it verbatim on the public
 * copy (after sanitizing the bundle) and never needs the VMK.
 */
export interface GamePublicationContent {
  title: string;
  description: string;
  codeBundle: string;
  markdown: string;
  learningGoal: string;
  successDefinition: string;
  successCriteria: Json;
  previewImage: string | null;
  /**
   * Per-locale listing content, one entry per platform locale (the source
   * locale's entry mirrors title/description). Produced by the publish
   * dialog's translate step (client-translate-game.ts); the server gate
   * requires full coverage and persists it as game_translations rows.
   */
  translations?: Record<string, { title: string; description: string }>;
}

/** Project a DECRYPTED game row onto the publication submission payload. */
export function toPublicationContent(game: Game): GamePublicationContent {
  return {
    title: game.title,
    description: game.description,
    codeBundle: game.code_bundle,
    markdown: game.markdown,
    learningGoal: game.learning_goal,
    successDefinition: game.success_definition,
    successCriteria: game.success_criteria,
    previewImage: game.preview_image,
  };
}
