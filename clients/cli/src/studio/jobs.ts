/**
 * Builds outlive the command that starts them. A build takes minutes, agent
 * shells time out after about two, so `dodi studio build|send|resume` writes a
 * job file and starts a detached worker process (`dodi studio __worker`) that
 * runs the build and keeps the job file up to date. `dodi studio wait` polls
 * it. The job file holds only what the agent itself said and dodi's reply; the
 * kids' context is reloaded by the worker, never written to disk.
 *
 * Files (mode 0600, under the config dir):
 *   studio/current.json   the game the agent is working on
 *   studio/<gameId>.json  that game's latest job
 */
import { spawn } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { configDir } from "../lib/config";

export type JobKind = "accept" | "edit" | "resume";
export type JobState = "starting" | "running" | "done" | "failed" | "stopped";

export interface JobResult {
  /** The build's outcome kind (built, failed, no_provider, …). */
  outcome: string;
  /** dodi's reply in the thread. */
  reply: string | null;
  /** The background / preview picture: null = fine, "skipped" | "failed" otherwise. */
  backgroundNotice: string | null;
  previewNotice: string | null;
  /** The visual check found problems it could not fix. */
  hasVisualCheckNotice: boolean;
  /** Frames from the game agent's own screenshot checks, saved as JPEGs. */
  frames: string[];
  /** The list preview picture, saved as a JPEG. */
  previewImage: string | null;
  title: string | null;
  isActive: boolean | null;
  failureReason?: string;
  saveError?: string;
  isResumable?: boolean;
}

export interface StudioJob {
  gameId: string;
  kind: JobKind;
  /** The agent's message (edit) or the plan to build (accept, optional). */
  text?: string;
  /** Reference images (data URLs) for an edit. */
  images?: string[];
  /** Where the frames go (the agent's working directory). */
  outDir: string;
  state: JobState;
  pid?: number;
  startedAt: string;
  updatedAt: string;
  /** The game agent's current step and its last "working aloud" sentence. */
  step?: string | null;
  narration?: string;
  error?: { message: string; hint?: string };
  result?: JobResult;
}

export function studioDir(): string {
  return path.join(configDir(), "studio");
}

const jobFile = (gameId: string) => path.join(studioDir(), `${gameId.replace(/[^a-zA-Z0-9-]/g, "")}.json`);

async function writePrivate(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await chmod(file, 0o600);
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

export async function readJob(gameId: string): Promise<StudioJob | null> {
  return readJson<StudioJob>(jobFile(gameId));
}

export async function writeJob(job: StudioJob): Promise<void> {
  await writePrivate(jobFile(job.gameId), { ...job, updatedAt: new Date().toISOString() });
}

export async function updateJob(gameId: string, patch: Partial<StudioJob>): Promise<StudioJob | null> {
  const job = await readJob(gameId);
  if (!job) return null;
  const next = { ...job, ...patch };
  await writeJob(next);
  return next;
}

export async function currentGameId(): Promise<string | null> {
  return (await readJson<{ gameId?: string }>(path.join(studioDir(), "current.json")))?.gameId ?? null;
}

export async function setCurrentGame(gameId: string): Promise<void> {
  await writePrivate(path.join(studioDir(), "current.json"), { gameId });
}

/** Whether the worker process of a running job is still alive. */
export function isWorkerAlive(job: StudioJob): boolean {
  if (!job.pid) return false;
  try {
    process.kill(job.pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** A job that is starting or running and whose worker still lives. */
export function isJobActive(job: StudioJob | null): boolean {
  return Boolean(job && (job.state === "starting" || job.state === "running") && isWorkerAlive(job));
}

/** Start the detached worker for the game's job file. */
export function spawnWorker(gameId: string): number | undefined {
  const child = spawn(process.execPath, [...process.execArgv, process.argv[1], "studio", "__worker", gameId], {
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();
  return child.pid;
}
