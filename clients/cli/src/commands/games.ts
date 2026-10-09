/**
 * dodi games new | list | pull | check | push | publish | status | dev
 *
 * Operations are exported as plain functions returning JSON-able results, so
 * `dodi mcp` exposes the very same behaviour as tools.
 */
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { SUPPORTED_LOCALES } from "@dodi/intl/locales";
import type { Game } from "@dodi/types/database";
import type { SuccessCriteria } from "@dodi/types/success";
import {
  decryptGame,
  encryptGameCreateFields,
  encryptGameFields,
  toPublicationContent,
} from "@dodi/vault";

import { parse, requirePositional } from "../lib/args";
import { checkGame, checkStatic, type CheckReport } from "../lib/game-check";
import {
  GAME_FILE,
  readGameProject,
  toCreateBody,
  toUpdateBody,
  writeGameMeta,
  type GameMeta,
} from "../lib/game-project";
import { AGENTS_MD, STARTER_BRIEFING, STARTER_GAME_HTML, starterMeta } from "../lib/game-template";
import { CliError, EXIT, type Output } from "../lib/output";
import { connect, type Connection } from "../lib/session";
import { listKids } from "./kids";
import { runDev } from "./games-dev";

const USAGE = `dodi games <command>
  new <folder> [--title <title>]     scaffold a working starter game
  list                               the family's games
  pull <game id> [<folder>]          download a game into a folder to edit or remix
  check [<folder>] [--local|--service|--static] [--locale <code>]
  push [<folder>] [--force]          seal and upload (creates or updates)
  publish [<folder>]                 submit to dodi Discover (reviewed)
  status [<folder>]                  Discover review status
  dev [<folder>] [--port <n>]        live preview in a browser, bridge log here`;

// ---------------------------------------------------------------------------
// new
// ---------------------------------------------------------------------------

export async function newGame(dirInput: string, title?: string) {
  const dir = path.resolve(dirInput);
  await mkdir(dir, { recursive: true });
  const existing = await readdir(dir);
  if (existing.includes(GAME_FILE) || existing.includes("game.md")) {
    throw new CliError(`${dir} already contains a game`, EXIT.usage, "Pick an empty folder.");
  }
  const name = title?.trim() || path.basename(dir).replace(/[-_]+/g, " ");
  await writeFile(path.join(dir, GAME_FILE), STARTER_GAME_HTML);
  await writeGameMeta(dir, starterMeta(name), STARTER_BRIEFING);
  await writeFile(path.join(dir, "AGENTS.md"), AGENTS_MD);
  await writeFile(path.join(dir, ".gitignore"), ".dodi/\n");
  return { dir, files: [GAME_FILE, "game.md", "AGENTS.md"], next: "dodi docs games" };
}

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
  await writeFile(path.join(dir, "AGENTS.md"), AGENTS_MD);
  await writeFile(path.join(dir, ".gitignore"), ".dodi/\n");
  if (game.preview_image?.startsWith("data:image/")) {
    const ext = game.preview_image.slice(11, game.preview_image.indexOf(";")).replace("jpeg", "jpg");
    const base64 = game.preview_image.slice(game.preview_image.indexOf(",") + 1);
    await writeFile(path.join(dir, `preview.${ext}`), Buffer.from(base64, "base64"));
  }
  return { dir, gameId, title: game.title };
}

// ---------------------------------------------------------------------------
// push
// ---------------------------------------------------------------------------

export async function pushGame(conn: Connection, dirInput: string, options: { force?: boolean } = {}) {
  const project = await readGameProject(dirInput);
  const result = checkStatic(project);
  if (result.errors.length && !options.force) {
    throw new CliError(
      `The game has ${result.errors.length} problem(s):\n- ${result.errors.join("\n- ")}`,
      EXIT.checkFailed,
      "Fix them (see `dodi games check`), or push anyway with --force.",
    );
  }
  if (!result.sanitizedCode) throw new CliError("The game cannot be sanitized", EXIT.checkFailed);

  const kids = await conn.api<Array<{ id: string }>>("/api/kids");
  const kidIds = kids.map((k) => k.id);
  if (kidIds.length === 0) throw new CliError("This family has no kids yet", EXIT.error, "Add a kid in the dodi app first.");

  if (project.meta.game_id) {
    const body = encryptGameFields(conn.vault, toUpdateBody(project, kidIds, result.sanitizedCode));
    const row = await conn.api<Game>(`/api/games/${encodeURIComponent(project.meta.game_id)}`, { method: "PATCH", body });
    return { action: "updated", gameId: row.id, title: project.meta.title, isActive: row.is_active, warnings: result.warnings };
  }

  const kidId = project.meta.kid ?? kidIds[0];
  if (!kidIds.includes(kidId)) throw new CliError(`kid ${kidId} is not in this family`, EXIT.usage, "See `dodi kids`.");
  const body = encryptGameCreateFields(conn.vault, toCreateBody(project, kidId, kidIds, result.sanitizedCode));
  const row = await conn.api<Game>("/api/games", { body });
  await writeGameMeta(project.dir, { ...project.meta, kid: kidId, game_id: row.id }, project.briefing);
  return { action: "created", gameId: row.id, title: project.meta.title, isActive: row.is_active, warnings: result.warnings };
}

// ---------------------------------------------------------------------------
// publish / status
// ---------------------------------------------------------------------------

function requireGameId(meta: GameMeta): string {
  if (!meta.game_id) {
    throw new CliError("This game was never pushed", EXIT.usage, "Run `dodi games push` first.");
  }
  return meta.game_id;
}

export async function publishGame(conn: Connection, dirInput: string) {
  const project = await readGameProject(dirInput);
  const gameId = requireGameId(project.meta);
  const missing = SUPPORTED_LOCALES.filter((locale) => !project.meta.listing?.[locale]?.title);
  if (missing.length) {
    throw new CliError(
      `game.md listing is missing ${missing.join(", ")}`,
      EXIT.usage,
      "Add listing: { <locale>: { title, description } } for every language (see `dodi docs publish`).",
    );
  }
  // Publish what the family has (the pushed version), not unpushed local edits.
  const row = await conn.api<Game>(`/api/games/${encodeURIComponent(gameId)}`);
  const game = decryptGame(conn.vault, row);
  if (game.code_bundle.trim() !== project.code.trim()) {
    throw new CliError("game.html has changes that were not pushed", EXIT.usage, "Run `dodi games push` first.");
  }
  const content = {
    ...toPublicationContent(game),
    successCriteria: (game.success_criteria ?? {}) as Record<string, unknown>,
    translations: Object.fromEntries(SUPPORTED_LOCALES.map((locale) => [locale, project.meta.listing![locale]])),
  };
  const { publication } = await conn.api<{ publication: { id: string; review_status?: string } }>(
    `/api/games/${encodeURIComponent(gameId)}/publication`,
    { body: content },
  );
  return { gameId, publicationId: publication.id, status: "submitted" };
}

export async function gameStatus(conn: Connection, dirInput: string) {
  const project = await readGameProject(dirInput);
  const gameId = requireGameId(project.meta);
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

function describeCheck(report: CheckReport): string {
  const lines = [report.ok ? "✓ No errors." : `✗ ${report.errors.length} error(s):`];
  for (const error of report.errors) lines.push(`  - ${error}`);
  if (report.warnings.length) {
    lines.push(`${report.warnings.length} warning(s):`);
    for (const warning of report.warnings) lines.push(`  - ${warning}`);
  }
  lines.push(`Size: ${Math.round(report.sizeBytes / 1024)} KB of 200 KB`);
  if (report.runtime) {
    lines.push(`Runtime (${report.runtime.via}): ${report.runtime.ready ? "game:ready received" : "never became ready"}`);
    if (report.runtime.frames.length) lines.push(`Frames: ${report.runtime.frames.join(", ")}`);
  }
  return lines.join("\n");
}

export async function runGames(argv: string[], out: Output): Promise<number> {
  const [sub, ...rest] = argv;
  switch (sub) {
    case "new": {
      const args = parse(rest, { title: { type: "string" } }, USAGE);
      const result = await newGame(requirePositional(args.positionals, 0, "folder", USAGE), args.str("title"));
      out.result(result, () => `Created ${result.dir}. Next: \`dodi docs games\`, then edit game.html and game.md.`);
      return EXIT.ok;
    }
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
    case "check": {
      const args = parse(
        rest,
        { local: { type: "boolean" }, service: { type: "boolean" }, static: { type: "boolean" }, locale: { type: "string" } },
        USAGE,
      );
      const runtime = args.flag("static") ? "none" : args.flag("local") ? "local" : args.flag("service") ? "service" : "auto";
      const project = await readGameProject(args.positionals[0] ?? ".");
      const report = await checkGame(project, {
        runtime,
        locale: args.str("locale"),
        connect: () => connect(),
      });
      out.result(report, () => describeCheck(report));
      return report.ok ? EXIT.ok : EXIT.checkFailed;
    }
    case "push": {
      const args = parse(rest, { force: { type: "boolean" } }, USAGE);
      const result = await pushGame(await connect(), args.positionals[0] ?? ".", { force: args.flag("force") });
      out.result(result, () =>
        [
          `${result.action === "created" ? "Created" : "Updated"} "${result.title}" (${result.gameId}).`,
          result.isActive ? "Kids can play it now." : "Hidden from kids until is_active: true (or the parent turns it on).",
        ].join("\n"),
      );
      return EXIT.ok;
    }
    case "publish": {
      const args = parse(rest, {}, USAGE);
      const result = await publishGame(await connect(), args.positionals[0] ?? ".");
      out.result(result, () => "Submitted to dodi Discover. It goes live after review: `dodi games status` shows where it is.");
      return EXIT.ok;
    }
    case "status": {
      const args = parse(rest, {}, USAGE);
      const result = await gameStatus(await connect(), args.positionals[0] ?? ".");
      out.result(result, () => JSON.stringify(result, null, 2));
      return EXIT.ok;
    }
    case "dev":
      return runDev(rest, out);
    default:
      throw new CliError(sub ? `Unknown command "games ${sub}"` : "Missing games command", EXIT.usage, USAGE);
  }
}
