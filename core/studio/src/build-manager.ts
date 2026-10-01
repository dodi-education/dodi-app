/**
 * The device's Game Studio build, owned by a store instead of a screen. One
 * build runs at a time; any UI subscribes to `store` for its live progress and
 * picks up the outcome when it finishes, even when the parent left the studio
 * (web: navigated elsewhere in the app; mobile: switched to another app while
 * the OS keeps the build alive as a background task).
 */

import { createStore, type StoreApi } from "zustand/vanilla";

import type { AgentStep } from "@dodi/types/agent-progress";

import type { AgentRunLog } from "./agent-run-log";
import { loadBuildCheckpoint, type StudioBuildCheckpoint } from "./build-checkpoint";
import {
  runStudioBuild,
  toBuildGame,
  type StudioBuildInput,
  type StudioBuildOutcome,
  type StudioBuildTexts,
} from "./build-runner";
import type { StudioPorts } from "./ports";
import type { StudioChatMessage } from "./transcript";

export interface ActiveBuild {
  gameId: string;
  /** The thread including the parent's in-flight message. */
  transcript: StudioChatMessage[];
  step: AgentStep | null;
  /** The model's live "working aloud" sentence. */
  narration: string;
  /** Streamed write_game_code input, rounded to 200-char steps. */
  writeChars: number;
  runLog: AgentRunLog | null;
  isResumed: boolean;
}

export interface StudioBuildState {
  active: ActiveBuild | null;
  /** Each game's last finished build, until a studio for that game takes it. */
  outcomes: Record<string, StudioBuildOutcome>;
}

/** An interrupted build that can continue from its checkpoint. */
export interface ResumableBuild {
  gameId: string;
  /** The parent's message the build was answering. */
  text: string;
  savedAt: number;
}

export interface BuildManager {
  store: StoreApi<StudioBuildState>;
  /** Start a build; resolves null when another build is already running. */
  start(input: StudioBuildInput): Promise<StudioBuildOutcome | null>;
  /** Continue the game's checkpointed build; null when busy or nothing to resume. */
  resume(gameId: string, texts: StudioBuildTexts): Promise<StudioBuildOutcome | null>;
  findResumable(gameId: string): Promise<ResumableBuild | null>;
  discardResumable(gameId: string): Promise<void>;
  /** The parent pressed Stop: end the build and drop its checkpoint. */
  stop(): void;
  /** The platform is about to suspend the build: end it, keep the checkpoint. */
  pause(): void;
  /** Hand the game's finished outcome to its studio (once). */
  takeOutcome(gameId: string): StudioBuildOutcome | null;
}

export function createBuildManager(ports: StudioPorts): BuildManager {
  const now = ports.now ?? Date.now;
  const store = createStore<StudioBuildState>()(() => ({ active: null, outcomes: {} }));
  let controller: AbortController | null = null;
  let isPauseRequested = false;

  const patchActive = (patch: Partial<ActiveBuild>): void => {
    const { active } = store.getState();
    if (active) store.setState({ active: { ...active, ...patch } });
  };

  const run = async (
    input: StudioBuildInput,
    resumeFrom?: StudioBuildCheckpoint,
  ): Promise<StudioBuildOutcome | null> => {
    if (store.getState().active) return null;
    controller = new AbortController();
    isPauseRequested = false;
    store.setState({
      active: {
        gameId: input.gameId,
        transcript: [
          ...input.history,
          {
            role: "user",
            text: input.text,
            ...(input.images.length ? { images: input.images } : {}),
          },
        ],
        step: null,
        narration: "",
        writeChars: 0,
        runLog: resumeFrom?.runLog ?? null,
        isResumed: Boolean(resumeFrom),
      },
    });
    try {
      const outcome = await runStudioBuild(input, ports, {
        signal: controller.signal,
        isPauseRequested: () => isPauseRequested,
        resumeFrom,
        onStep: (step) => patchActive({ step }),
        onRunLog: (runLog) => patchActive({ runLog }),
        // Rounding the write ticker to 200-char steps keeps updates coarse.
        onActivity: (event) => {
          const narration = store.getState().active?.narration ?? "";
          if (event.type === "narration_start") patchActive({ narration: "" });
          else if (event.type === "narration_delta") patchActive({ narration: narration + event.text });
          else if (
            event.type === "tool_started" &&
            (event.name === "write_game_code" || event.name === "edit_game_code")
          )
            patchActive({ writeChars: 0 });
          else if (event.type === "write_progress")
            patchActive({ writeChars: Math.floor(event.chars / 200) * 200 });
        },
      });
      store.setState((state) => ({
        active: null,
        outcomes: { ...state.outcomes, [input.gameId]: outcome },
      }));
      return outcome;
    } catch (err) {
      // runStudioBuild reports its own failures; anything here is a bug in
      // the manager's wiring, and must still free the slot.
      store.setState({ active: null });
      throw err;
    } finally {
      controller = null;
    }
  };

  const loadCheckpoint = async (gameId: string) => {
    if (!ports.checkpoints) return null;
    const session = await ports.session().catch(() => null);
    if (!session) return null;
    return loadBuildCheckpoint(ports.checkpoints, session, gameId, now()).catch(() => null);
  };

  return {
    store,
    start: (input) => run({ ...input, game: toBuildGame(input.game) }),
    resume: async (gameId, texts) => {
      if (store.getState().active) return null;
      const checkpoint = await loadCheckpoint(gameId);
      if (!checkpoint) return null;
      return run({ ...checkpoint.input, texts }, checkpoint);
    },
    findResumable: async (gameId) => {
      if (store.getState().active?.gameId === gameId) return null;
      const checkpoint = await loadCheckpoint(gameId);
      return checkpoint
        ? { gameId, text: checkpoint.input.text, savedAt: checkpoint.savedAt }
        : null;
    },
    discardResumable: async (gameId) => {
      await ports.checkpoints?.clear(gameId).catch(() => {});
    },
    stop: () => {
      isPauseRequested = false;
      controller?.abort();
    },
    pause: () => {
      isPauseRequested = true;
      controller?.abort();
    },
    takeOutcome: (gameId) => {
      const outcome = store.getState().outcomes[gameId] ?? null;
      if (outcome) {
        store.setState((state) => {
          const { [gameId]: _taken, ...rest } = state.outcomes;
          return { outcomes: rest };
        });
      }
      return outcome;
    },
  };
}
