/**
 * dodi games list | pull | push | publish | status
 *
 * Games are made with `dodi studio`. These commands cover the rest: listing
 * the family's games, publishing one to dodi Discover (with the same
 * translation step as the apps), and pulling a game into a folder for manual
 * edits and pushing them back as a new version.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { postPublication, PublicationRequestError } from "@dodi/client-state/game-publication";
import { translateGameForPublication } from "@dodi/client-state/publication-translation";
import { MissingTranslationsError } from "@dodi/client-state/game-publication";
import { NoThinkingModelError } from "@dodi/client-state/resolve-execution";
import type { Game } from "@dodi/types/database";
import type { SuccessCriteria } from "@dodi/types/success";
import { decryptGame, encryptGameFields } from "@dodi/vault";

import { parse, requirePositional, showHelp } from "../lib/args";
import { checkStatic } from "../lib/game-check";
import {
  GAME_FILE,
  PULLED_GAME_README,
  readGameProject,
  toUpdateBody,
  writeGameMeta,
  type GameMeta,
} from "../lib/game-project";
import { CliError, EXIT, type Output } from "../lib/output";
import { connect, type Connection } from "../lib/session";
import { currentGameId } from "../studio/jobs";
import { createCliThinking } from "../studio/ports";

const USAGE = `dodi games <command>
  list                          the family's games
  publish [<game id>]           submit a game to dodi Discover (translated, then reviewed)
  status [<game id>]            its Discover review status
  pull <game id> [<folder>]     download a game for manual edits
  push [<folder>] [--force]     upload manual edits of a pulled game as a new version
Without a game id, publish and status use the current studio game.`;

// ---------------------------------------------------------------------------
// list / pull
// ---------------------------------------------------------------------------

export async function listGames(conn: Connection) {
  const rows = await conn.api<Array<Game & { sharing?: { family: boolean; kidIds: string[] } }>>(
    "/api/games?scope=account",
  );
  return rows
    .filter((row) => !row.publication_requested_at)
    .map((row) => {
      const game = decryptGame(conn.vault, row);
      return {
        id: game.id,
        title: game.title,
        kidId: game.kid_id,
        isActive: game.is_active,
        progressKind: game.progress_kind,
        updatedAt: game.updated_at,
        createdWith: (game.metadata as Record<string, unknown> | null)?.createdWith ?? null,
      };
    });
}

function metaFromGame(game: Game, sharing: { family: boolean; kidIds: string[] } | undefined): GameMeta {
  const metadata = (game.metadata ?? {}) as Record<string, unknown>;
  const criteria = game.success_criteria as unknown as SuccessCriteria | null;
  return {
    title: game.title,
    description: game.description ?? "",
    ...(game.kid_id ? { kid: game.kid_id } : {}),
    audience: sharing && !sharing.family ? sharing.kidIds : "family",
    is_active: game.is_active,
    ...(game.target_age_min != null ? { age_min: game.target_age_min } : {}),
    ...(game.target_age_max != null ? { age_max: game.target_age_max } : {}),
    ...(game.estimated_duration_minutes != null ? { duration_minutes: game.estimated_duration_minutes } : {}),
    tags: game.tags ?? [],
    progress_kind: game.progress_kind,
    capabilities: Array.isArray(metadata.capabilities) ? (metadata.capabilities as string[]) : [],
    ...(typeof metadata.perspective === "string" ? { perspective: metadata.perspective as GameMeta["perspective"] } : {}),
    learning_goal: game.learning_goal ?? "",
    success_definition: game.success_definition ?? "",
    ...(criteria && criteria.conditions?.length ? { success_criteria: criteria } : {}),
    game_id: game.id,
  };
}

export async function pullGame(conn: Connection, gameId: string, dirInput?: string) {
  const row = await conn.api<Game>(`/api/games/${encodeURIComponent(gameId)}`);
  const game = decryptGame(conn.vault, row);
  const all = await conn.api<Array<{ id: string; sharing?: { family: boolean; kidIds: string[] } }>>("/api/games?scope=account");
  const sharing = all.find((g) => g.id === gameId)?.sharing;
  const dir = path.resolve(dirInput ?? (game.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || gameId));
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, GAME_FILE), game.code_bundle);
  await writeGameMeta(dir, metaFromGame(game, sharing), game.markdown ?? "");
  await writeFile(path.join(dir, "README.md"), PULLED_GAME_README);
  if (game.preview_image?.startsWith("data:image/")) {
    const ext = game.preview_image.slice(11, game.preview_image.indexOf(";")).replace("jpeg", "jpg");
    const base64 = game.preview_image.slice(game.preview_image.indexOf(",") + 1);
    await writeFile(path.join(dir, `preview.${ext}`), Buffer.from(base64, "base64"));
  }
  return { dir, gameId, title: game.title };
}

// ---------------------------------------------------------------------------
// push (manual edits of a pulled game)
// ---------------------------------------------------------------------------

export async function pushGame(conn: Connection, dirInput: string, options: { force?: boolean } = {}) {
  const project = await readGameProject(dirInput);
  if (!project.meta.game_id) {
    throw new CliError(
      "This folder is not a pulled game",
      EXIT.usage,
      'Games are made with `dodi studio new "<brief>"`. To edit one by hand, `dodi games pull <id>` first.',
    );
  }
  const result = checkStatic(project);
  if (result.errors.length && !options.force) {
    throw new CliError(
      `The game has ${result.errors.length} problem(s):\n- ${result.errors.join("\n- ")}`,
      EXIT.checkFailed,
      "Fix them, or push anyway with --force.",
    );
  }
  if (!result.sanitizedCode) throw new CliError("The game cannot be sanitized", EXIT.checkFailed);
  const kids = await conn.api<Array<{ id: string }>>("/api/kids");
  const body = encryptGameFields(conn.vault, toUpdateBody(project, kids.map((k) => k.id), result.sanitizedCode));
  const row = await conn.api<Game>(`/api/games/${encodeURIComponent(project.meta.game_id)}`, { method: "PATCH", body });
  return { action: "updated", gameId: row.id, title: project.meta.title, isActive: row.is_active, warnings: result.warnings };
}

// ---------------------------------------------------------------------------
// publish / status
// ---------------------------------------------------------------------------

async function gameIdOr(positional: string | undefined): Promise<string> {
  const gameId = positional ?? (await currentGameId());
  if (!gameId) throw new CliError("Which game?", EXIT.usage, "Give a game id (see `dodi games list`).");
  return gameId;
}

/**
 * Publish like the apps' publish dialog: translate the game into every
 * platform language with the family's thinking model (the translated bundle
 * is sealed back into the family's own game first), then submit the
 * plaintext copy for review.
 */
export async function publishGame(conn: Connection, gameId: string) {
  const thinking = await createCliThinking(conn);
  let game = decryptGame(conn.vault, await conn.api<Game>(`/api/games/${encodeURIComponent(gameId)}`));
  let review;
  try {
    review = await translateGameForPublication(
      { resolveThinking: thinking.resolveThinking, reportUsage: (report) => thinking.telemetry.reportUsage(report) },
      game,
    );
  } catch (error) {
    if (error instanceof MissingTranslationsError) {
      throw new CliError("This game is too old to translate", EXIT.error, 'Rebuild it with dodi first: `dodi studio send "Rebuild the game"`.');
    }
    if (error instanceof NoThinkingModelError) {
      throw new CliError("Publishing needs a thinking model to translate the game", EXIT.error, "The parent sets one up under Settings > AI providers.");
    }
    throw error;
  }
  if (review.codeBundle !== game.code_bundle) {
    const sealed = encryptGameFields(conn.vault, { code_bundle: review.codeBundle });
    game = decryptGame(
      conn.vault,
      await conn.api<Game>(`/api/games/${encodeURIComponent(gameId)}`, {
        method: "PATCH",
        body: { ...sealed, create_version: false },
      }),
    );
  }
  try {
    const publication = await postPublication({ api: conn.client }, gameId, game, { ...review, codeBundle: game.code_bundle });
    return { gameId, publicationId: publication.id, status: "submitted", languages: Object.keys(review.translations) };
  } catch (error) {
    if (error instanceof PublicationRequestError && /handle/i.test(error.message + String(error.serverError ?? ""))) {
      throw new CliError("The family has no public publication name yet", EXIT.error, "The parent picks one once when publishing a game in the dodi app.");
    }
    throw error;
  }
}

export async function gameStatus(conn: Connection, gameId: string) {
  const { publication } = await conn.api<{ publication: Record<string, unknown> | null }>(
    `/api/games/${encodeURIComponent(gameId)}/publication`,
  );
  if (!publication) return { gameId, published: false };
  const pick = (key: string) => publication[key] ?? null;
  return {
    gameId,
    published: true,
    publicationId: pick("id"),
    submittedAt: pick("publication_requested_at"),
    publishedAt: pick("published_at"),
    rejectedAt: pick("rejected_at"),
    rejectionKind: pick("rejection_kind"),
    rejectionReasons: pick("rejection_reasons"),
    state: publication.published_at ? "live" : publication.rejected_at ? "rejected" : "in_review",
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export async function runGames(argv: string[], out: Output): Promise<number> {
  if (showHelp(argv, out, USAGE)) return EXIT.ok;
  const [sub, ...rest] = argv;
  switch (sub) {
    case "list": {
      parse(rest, {}, USAGE);
      const games = await listGames(await connect());
      out.result({ games }, () =>
        games.length
          ? games.map((g) => `${g.id}  ${g.title}${g.isActive ? "" : "  (hidden from kids)"}`).join("\n")
          : "No games yet.",
      );
      return EXIT.ok;
    }
    case "pull": {
      const args = parse(rest, {}, USAGE);
      const result = await pullGame(await connect(), requirePositional(args.positionals, 0, "game id", USAGE), args.positionals[1]);
      out.result(result, () => `Pulled "${result.title}" into ${result.dir}.`);
      return EXIT.ok;
    }
    case "push": {
      const args = parse(rest, { force: { type: "boolean" } }, USAGE);
      const result = await pushGame(await connect(), args.positionals[0] ?? ".", { force: args.flag("force") });
      out.result(result, () => `Updated "${result.title}" (${result.gameId}).`);
      return EXIT.ok;
    }
    case "publish": {
      const args = parse(rest, {}, USAGE);
      const result = await publishGame(await connect(), await gameIdOr(args.positionals[0]));
      out.result(result, () => "Submitted to dodi Discover. It goes live after review: `dodi games status` shows where it is.");
      return EXIT.ok;
    }
    case "status": {
      const args = parse(rest, {}, USAGE);
      const result = await gameStatus(await connect(), await gameIdOr(args.positionals[0]));
      out.result(result, () => JSON.stringify(result, null, 2));
      return EXIT.ok;
    }
    default:
      throw new CliError(sub ? `Unknown command "games ${sub}"` : "Missing games command", EXIT.usage, USAGE);
  }
}
