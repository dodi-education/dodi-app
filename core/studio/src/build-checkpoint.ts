/**
 * A studio build's checkpoint: the agent loop's state after its last completed
 * turn, plus what the studio needs to finish the job (the build input and the
 * run log so far). Sealed under the vault and kept on the device only, so a
 * build that a reload, a closed tab or the OS cut short can continue instead
 * of starting over (and spending every turn again).
 */

import type { AgentCheckpoint } from "@dodi/ai/game-agent";
import type { AIProviderId } from "@dodi/types/ai";
import type { VaultSession } from "@dodi/vault";

import { type AgentRunLog, restoreRunLog, startAgentRun } from "./agent-run-log";
import type { StudioBuildInput } from "./build-runner";
import type { CheckpointStore } from "./ports";

export const STUDIO_CHECKPOINT_VERSION = 1;

/** Checkpoints older than this are dropped instead of offered for resume. */
export const STUDIO_CHECKPOINT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface StudioBuildCheckpoint {
  version: typeof STUDIO_CHECKPOINT_VERSION;
  savedAt: number;
  /** When the original build started (failure telemetry measures from here). */
  startedAt: number;
  /** The build input minus its UI texts, which the resuming client supplies. */
  input: Omit<StudioBuildInput, "texts">;
  /** The provider + model the transcript was written with (never the key). */
  provider: Exclude<AIProviderId, "dodi">;
  model: string;
  agent: AgentCheckpoint;
  runLog: AgentRunLog;
}

export async function saveBuildCheckpoint(
  store: CheckpointStore,
  session: VaultSession,
  checkpoint: StudioBuildCheckpoint,
): Promise<void> {
  await store.save(checkpoint.input.gameId, session.encryptJson(checkpoint));
}

/**
 * The game's checkpoint, or null when there is none, it can't be opened with
 * this vault, it comes from another format version, or it is stale. Unusable
 * checkpoints are cleared on the way.
 */
export async function loadBuildCheckpoint(
  store: CheckpointStore,
  session: VaultSession,
  gameId: string,
  now: number,
): Promise<StudioBuildCheckpoint | null> {
  const sealed = await store.load(gameId);
  if (!sealed) return null;
  let checkpoint: StudioBuildCheckpoint | null = null;
  try {
    checkpoint = session.decryptJson<StudioBuildCheckpoint>(sealed);
  } catch {
    checkpoint = null;
  }
  const isUsable =
    checkpoint !== null &&
    checkpoint.version === STUDIO_CHECKPOINT_VERSION &&
    checkpoint.input?.gameId === gameId &&
    now - checkpoint.savedAt <= STUDIO_CHECKPOINT_MAX_AGE_MS;
  if (!isUsable || !checkpoint) {
    await store.clear(gameId);
    return null;
  }
  return { ...checkpoint, runLog: restoreRunLog(checkpoint.runLog) ?? startAgentRun(now) };
}
