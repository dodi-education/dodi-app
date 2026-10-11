/**
 * dodi studio: the agent plays the parent's part in Game Studio. It plans
 * with dodi, accepts the plan and reviews what dodi's game agent builds,
 * round by round, exactly as a parent does in the app. The game agent runs
 * here with the family's own providers (the build keys the parent sealed to
 * this agent), so games get the same background and preview pictures, visual
 * check, success mapping and translations as in the browser.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { createBuildManager } from "@dodi/studio/build-manager";
import type { StudioBuildOutcome } from "@dodi/studio/build-runner";
import { persistTranscript, setGameActive } from "@dodi/studio/studio-editor";
import {
  acceptPlan,
  lastBuildChecks,
  lastReply,
  openStudioGame,
  planTurn,
  prepareEdit,
  StudioSessionError,
} from "@dodi/studio/studio-session";

import { parse, requirePositional } from "../lib/args";
import { CliError, EXIT, type Output } from "../lib/output";
import { connect, type Connection } from "../lib/session";
import { loadStudioContext } from "../studio/context";
import { nodeImageOps } from "../studio/image-ops";
import {
  currentGameId,
  isJobActive,
  isWorkerAlive,
  readJob,
  setCurrentGame,
  spawnWorker,
  updateJob,
  writeJob,
  type JobKind,
  type JobResult,
  type StudioJob,
} from "../studio/jobs";
import { createCliStudioPorts } from "../studio/ports";

const USAGE = `dodi studio <command>
  new "<brief>" [--kid <id>]        start a game: plan it with dodi
  plan "<message>"                  keep planning (answer dodi, ask for changes)
  build [--plan "<text>"]           accept the plan; dodi builds the game (in the background)
  send "<feedback>" [--image <file>]  a change round on the built game (in the background)
  wait [--timeout <seconds>]        wait for the build; prints dodi's reply and the screenshots
  show                              where the current game stands
  stop | resume                     stop the build / continue an interrupted one
  open <game id>                    work on another of the family's games
  activate                          let the kids play it (only when the parent asked for it)
All commands work on the current game; --game <id> picks another.`;

/** Attachments are bounded like the studio's (downscaled JPEGs). */
const ATTACHMENT_BOUND = { maxWidth: 1024, maxHeight: 1024, quality: 0.85 };
const POLL_MS = 2_000;
const DEFAULT_WAIT_SECONDS = 110;

function sessionError(error: unknown): never {
  if (error instanceof StudioSessionError) {
    const messages: Record<StudioSessionError["code"], [string, string]> = {
      not_found: ["That game doesn't exist in this family", "See `dodi games list`, then `dodi studio open <id>`."],
      no_kids: ["This family has no kids yet", "The parent adds a kid in the dodi app first."],
      still_planning: ["This game is still being planned", "Keep planning with `dodi studio plan`, or build the plan with `dodi studio build`."],
      not_planning: ["This game is past planning", 'Ask for changes with `dodi studio send "<feedback>"`.'],
      no_plan: ["There is no plan to build yet", 'Plan with dodi first: `dodi studio plan "<message>"`.'],
      vault_locked: ["The family vault is locked", "Run `dodi login` again."],
    };
    const [message, hint] = messages[error.code];
    throw new CliError(message, EXIT.usage, hint);
  }
  throw error;
}

async function gameFor(args: { str(name: string): string | undefined }): Promise<string> {
  const gameId = args.str("game") ?? (await currentGameId());
  if (!gameId) {
    throw new CliError("No current game", EXIT.usage, 'Start one with `dodi studio new "<brief>"` or pick one with `dodi studio open <id>`.');
  }
  return gameId;
}

async function readImages(files: string[]): Promise<string[]> {
  const images: string[] = [];
  for (const file of files) {
    const bytes = await readFile(file).catch(() => {
      throw new CliError(`Can't read ${file}`, EXIT.usage);
    });
    const mime = /\.png$/i.test(file) ? "image/png" : "image/jpeg";
    const scaled = await nodeImageOps.downscale(`data:${mime};base64,${bytes.toString("base64")}`, ATTACHMENT_BOUND);
    if (!scaled) throw new CliError(`${file} is not a PNG or JPEG`, EXIT.usage);
    images.push(scaled);
  }
  return images;
}

// ----- Plan step (runs here, one AI turn) ------------------------------------------

async function runPlan(conn: Connection, gameId: string | null, text: string, kidId: string | undefined, out: Output) {
  const ports = await createCliStudioPorts(conn);
  const ctx = await loadStudioContext(conn);
  out.info("dodi is thinking…");
  const result = await planTurn(ports, ctx, { gameId, text, kidId: kidId ?? null }).catch(sessionError);
  if (result.kind === "no_provider") {
    throw new CliError("The family has no game model set up", EXIT.error, "The parent sets one up under Settings > AI providers.");
  }
  if (result.gameId) await setCurrentGame(result.gameId);
  return {
    gameId: result.gameId,
    state: result.kind,
    reply: result.reply?.text ?? null,
    plan: result.plan || null,
    next: result.plan
      ? 'Read the plan. Refine it with `dodi studio plan "<message>"`, or have dodi build it with `dodi studio build`.'
      : 'Answer dodi with `dodi studio plan "<message>"`.',
  };
}

function describePlan(result: Awaited<ReturnType<typeof runPlan>>): string {
  return [
    result.reply ? `dodi: ${result.reply}` : "dodi did not answer.",
    result.plan ? `\nThe plan on the table:\n${result.plan}` : "",
    "",
    result.next,
  ].join("\n");
}

// ----- Builds (background worker) ----------------------------------------------------

async function startJob(gameId: string, kind: JobKind, fields: Pick<StudioJob, "text" | "images">): Promise<StudioJob> {
  const existing = await readJob(gameId);
  if (isJobActive(existing)) {
    throw new CliError("dodi is already building this game", EXIT.usage, "Wait for it with `dodi studio wait`, or stop it with `dodi studio stop`.");
  }
  const now = new Date().toISOString();
  const job: StudioJob = { gameId, kind, ...fields, outDir: process.cwd(), state: "starting", startedAt: now, updatedAt: now };
  await writeJob(job);
  const pid = spawnWorker(gameId);
  return (await updateJob(gameId, { pid })) ?? job;
}

function framesDir(job: Pick<StudioJob, "outDir" | "gameId">): string {
  return path.join(job.outDir, "dodi-studio", job.gameId);
}

async function saveImage(file: string, dataUrl: string): Promise<string | null> {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  if (!base64) return null;
  await writeFile(file, Buffer.from(base64, "base64"));
  return file;
}

async function summarize(outcome: StudioBuildOutcome, job: StudioJob): Promise<JobResult> {
  const dir = framesDir(job);
  await mkdir(dir, { recursive: true });
  const frames: string[] = [];
  let n = 0;
  for (const check of lastBuildChecks(outcome.transcript)) {
    for (const frame of check.frames) {
      const slug = frame.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "frame";
      const saved = await saveImage(path.join(dir, `${String(n++).padStart(2, "0")}-${slug}.jpg`), frame.fullImage ?? frame.image);
      if (saved) frames.push(saved);
    }
  }
  const built = outcome.kind === "built" ? outcome : null;
  const previewSource = built?.savedRow?.preview_image ?? (outcome.kind === "preview_only" ? outcome.previewImage : null);
  return {
    outcome: outcome.kind,
    reply: lastReply(outcome.transcript)?.text ?? null,
    backgroundNotice: built?.backgroundNotice ?? null,
    previewNotice: built?.previewNotice ?? null,
    hasVisualCheckNotice: built?.hasVisualCheckNotice ?? false,
    frames,
    previewImage: previewSource ? await saveImage(path.join(dir, "preview.jpg"), previewSource) : null,
    title: built?.savedRow?.title ?? null,
    isActive: built?.savedRow?.is_active ?? null,
    ...(outcome.kind === "failed" ? { failureReason: outcome.reason, isResumable: outcome.isResumable } : {}),
    ...(built?.saveError !== undefined ? { saveError: built.saveError } : {}),
  };
}

/** The detached worker: prepare the build, run it, record the outcome. */
async function runWorker(gameId: string): Promise<number> {
  const job = await readJob(gameId);
  if (!job) return EXIT.error;
  await updateJob(gameId, { state: "running", pid: process.pid });
  try {
    const conn = await connect();
    const ports = await createCliStudioPorts(conn);
    const ctx = await loadStudioContext(conn);
    const manager = createBuildManager(ports);
    await rm(framesDir(job), { recursive: true, force: true });

    let lastWrite = 0;
    manager.store.subscribe((state) => {
      const active = state.active;
      if (!active || Date.now() - lastWrite < 1_000) return;
      lastWrite = Date.now();
      void updateJob(gameId, { step: active.step, narration: active.narration });
    });
    process.on("SIGTERM", () => manager.stop());

    let outcome: StudioBuildOutcome | null;
    if (job.kind === "resume") {
      outcome = await manager.resume(gameId, ctx.texts.build);
      if (!outcome) throw new CliError("There is no interrupted build to continue", EXIT.usage);
    } else {
      const input =
        job.kind === "accept"
          ? await acceptPlan(ports, ctx, { gameId, ...(job.text ? { planText: job.text } : {}) })
          : await prepareEdit(ports, ctx, { gameId, text: job.text ?? "", images: job.images ?? [] });
      outcome = await manager.start(input);
    }
    if (!outcome) throw new CliError("Another build was already running on this machine", EXIT.error);
    // A finished build persists its own thread; the others keep theirs here
    // (as the app does), so the parent sees "stopped" or "failed" too.
    if (outcome.kind !== "built" && outcome.kind !== "preview_only") {
      await persistTranscript(ports, gameId, outcome.transcript).catch(() => {});
    }
    const result = await summarize(outcome, job);
    const state = outcome.kind === "stopped" ? "stopped" : outcome.kind === "built" || outcome.kind === "preview_only" ? "done" : "failed";
    await updateJob(gameId, { state, result, step: null, narration: "" });
    return EXIT.ok;
  } catch (error) {
    const cli = error instanceof CliError ? error : null;
    const message = error instanceof StudioSessionError ? error.code : error instanceof Error ? error.message : String(error);
    await updateJob(gameId, { state: "failed", error: { message, ...(cli?.hint ? { hint: cli.hint } : {}) } });
    return EXIT.error;
  }
}

function describeJob(job: StudioJob): string {
  if (job.state === "starting" || job.state === "running") {
    return [`dodi is still building${job.narration ? `: ${job.narration}` : ""}.`, "Run `dodi studio wait` again."].join("\n");
  }
  if (job.error) return `The build did not run: ${job.error.message}${job.error.hint ? `\n${job.error.hint}` : ""}`;
  const r = job.result;
  if (!r) return `Build ${job.state}.`;
  const lines = [r.reply ? `dodi: ${r.reply}` : `Build ${r.outcome}.`];
  if (r.title) lines.push(`\nGame: ${r.title}${r.isActive ? " (kids can play it)" : " (hidden from the kids until the parent turns it on)"}`);
  if (r.backgroundNotice) lines.push(`Background picture: ${r.backgroundNotice}`);
  if (r.previewNotice) lines.push(`Preview picture: ${r.previewNotice}`);
  if (r.hasVisualCheckNotice) lines.push("The visual check still found problems: look at the frames.");
  if (r.frames.length) lines.push(`\nScreenshots from dodi's checks (open them):\n${r.frames.map((f) => `  ${f}`).join("\n")}`);
  if (r.previewImage) lines.push(`List preview: ${r.previewImage}`);
  if (r.outcome === "built") lines.push('\nNext: review the screenshots, then `dodi studio send "<feedback>"`, or stop when it is right.');
  if (r.isResumable) lines.push("It can continue where it stopped: `dodi studio resume`.");
  return lines.join("\n");
}

async function waitFor(gameId: string, seconds: number): Promise<StudioJob> {
  const deadline = Date.now() + seconds * 1000;
  for (;;) {
    let job = await readJob(gameId);
    if (!job) throw new CliError("Nothing is being built for this game", EXIT.usage, "Start with `dodi studio build` or `dodi studio send`.");
    const isUnderway = job.state === "running" || (job.state === "starting" && job.pid !== undefined);
    if (isUnderway && !isWorkerAlive(job)) {
      job = (await updateJob(gameId, {
        state: "failed",
        error: { message: "The build process ended unexpectedly", hint: "Continue it with `dodi studio resume`." },
      }))!;
    }
    if (job.state !== "starting" && job.state !== "running") return job;
    if (Date.now() + POLL_MS > deadline) return job;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

// ----- Command ---------------------------------------------------------------------

export async function runStudio(argv: string[], out: Output): Promise<number> {
  const [sub, ...rest] = argv;
  if (sub === "__worker") return runWorker(requirePositional(rest, 0, "game id", USAGE));

  const common = { game: { type: "string" as const } };
  switch (sub) {
    case "new": {
      const args = parse(rest, { ...common, kid: { type: "string" } }, USAGE);
      const brief = requirePositional(args.positionals, 0, "brief", USAGE);
      const result = await runPlan(await connect(), null, brief, args.str("kid"), out);
      out.result(result, () => describePlan(result));
      return EXIT.ok;
    }
    case "plan": {
      const args = parse(rest, common, USAGE);
      const text = requirePositional(args.positionals, 0, "message", USAGE);
      const result = await runPlan(await connect(), await gameFor(args), text, undefined, out);
      out.result(result, () => describePlan(result));
      return EXIT.ok;
    }
    case "build": {
      const args = parse(rest, { ...common, plan: { type: "string" } }, USAGE);
      const gameId = await gameFor(args);
      const job = await startJob(gameId, "accept", { ...(args.str("plan") ? { text: args.str("plan") } : {}) });
      out.result({ gameId, state: job.state }, () => "dodi is building the game. Run `dodi studio wait` to follow it (a build takes a few minutes).");
      return EXIT.ok;
    }
    case "send": {
      const args = parse(rest, { ...common, image: { type: "string", multiple: true } }, USAGE);
      const text = requirePositional(args.positionals, 0, "feedback", USAGE);
      const gameId = await gameFor(args);
      const files = (args.values.image as string[] | undefined) ?? [];
      const job = await startJob(gameId, "edit", { text, images: await readImages(files) });
      out.result({ gameId, state: job.state }, () => "dodi is working on it. Run `dodi studio wait` to follow it.");
      return EXIT.ok;
    }
    case "resume": {
      const args = parse(rest, common, USAGE);
      const gameId = await gameFor(args);
      const job = await startJob(gameId, "resume", {});
      out.result({ gameId, state: job.state }, () => "dodi continues the build. Run `dodi studio wait`.");
      return EXIT.ok;
    }
    case "wait": {
      const args = parse(rest, { ...common, timeout: { type: "string" } }, USAGE);
      const seconds = Number(args.str("timeout") ?? DEFAULT_WAIT_SECONDS);
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > 900) throw new CliError("--timeout must be 0 to 900 seconds", EXIT.usage, USAGE);
      const job = await waitFor(await gameFor(args), seconds);
      out.result(job, () => describeJob(job));
      if (job.state === "starting" || job.state === "running") return EXIT.pending;
      return job.state === "done" ? EXIT.ok : EXIT.error;
    }
    case "stop": {
      const args = parse(rest, common, USAGE);
      const job = await readJob(await gameFor(args));
      if (!job || !isJobActive(job)) {
        out.result({ state: "idle" }, () => "Nothing is being built.");
        return EXIT.ok;
      }
      process.kill(job.pid!, "SIGTERM");
      out.result({ state: "stopping" }, () => "Stopping. `dodi studio wait` shows when it has stopped.");
      return EXIT.ok;
    }
    case "show": {
      const args = parse(rest, common, USAGE);
      const gameId = await gameFor(args);
      const conn = await connect();
      const snapshot = await openStudioGame({ api: conn.client, session: async () => conn.vault }, gameId).catch(sessionError);
      const job = await readJob(gameId);
      const reply = lastReply(snapshot.transcript);
      const result = {
        gameId,
        title: snapshot.game.title || null,
        stage: snapshot.planning ? "planning" : snapshot.game.built ? "built" : "not built yet",
        plan: snapshot.planning?.summary || null,
        isActive: snapshot.game.isActive,
        lastReply: reply?.text ?? null,
        build: job ? { state: job.state, narration: job.narration ?? null } : null,
      };
      out.result(result, () =>
        [
          `${result.title ?? "Untitled game"} (${result.stage}${result.isActive ? ", kids can play it" : ""})`,
          result.plan ? `\nPlan:\n${result.plan}` : "",
          result.lastReply ? `\ndodi's last reply:\n${result.lastReply}` : "",
          result.build ? `\nLast build: ${result.build.state}` : "",
        ].join("\n"),
      );
      return EXIT.ok;
    }
    case "open": {
      const args = parse(rest, {}, USAGE);
      const gameId = requirePositional(args.positionals, 0, "game id", USAGE);
      const conn = await connect();
      const snapshot = await openStudioGame({ api: conn.client, session: async () => conn.vault }, gameId).catch(sessionError);
      await setCurrentGame(gameId);
      out.result({ gameId, title: snapshot.game.title }, () => `Now working on "${snapshot.game.title || "Untitled game"}".`);
      return EXIT.ok;
    }
    case "activate": {
      const args = parse(rest, common, USAGE);
      const gameId = await gameFor(args);
      const conn = await connect();
      await setGameActive({ api: conn.client, games: { put: () => {}, patchLocal: () => {}, invalidate: () => {} } }, gameId, true);
      out.result({ gameId, isActive: true }, () => "The kids can play it now.");
      return EXIT.ok;
    }
    default:
      throw new CliError(sub ? `Unknown command "studio ${sub}"` : "Missing studio command", EXIT.usage, USAGE);
  }
}
