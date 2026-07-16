import type { Json } from "./database";
import type {
  DodiProgressState,
  MetricsSummary,
  ProgressKind,
  SuccessCriteria,
} from "./success";

export type GameStateSummary = Record<string, Json | undefined>;

/**
 * A COMPLETE, self-contained serialization of a game — everything needed to
 * restore play exactly (including visual surfaces, e.g. a canvas as a data
 * URL). Distinct from {@link GameStateSummary}, which is the lightweight
 * AI-facing state pushed to the voice model.
 */
export type GameSaveState = Record<string, Json | undefined>;

/**
 * The learning goal + success target handed to a game at init. Lets the game
 * display the goal and size itself (e.g. generate exactly enough tasks).
 */
export interface GameGoal {
  learningGoal: string;
  successDefinition: string;
  successCriteria: SuccessCriteria;
  progressKind: ProgressKind;
}

export interface GameCommand {
  type: string;
  payload?: Record<string, Json | undefined>;
}

/**
 * Normalized "who can play" sharing state, sourced from the `game_sharings`
 * table. `family` = shared with the whole account; `kidIds` = specific kids.
 */
export interface GameSharingState {
  family: boolean;
  kidIds: string[];
}

/**
 * Which kind of picture `generate_drawing` produces for a game:
 * - `picture` — a plain, kid-friendly 2D line drawing of the subject (Drawing game)
 * - `mandala` — a symmetrical mandala / zentangle coloring sheet (Mandala game)
 * Absent metadata defaults to `picture`.
 */
export type DrawingStyle = "picture" | "mandala";

export type GameMetadata = Record<string, Json | undefined> & {
  version?: string;
  category?: string;
  capabilities?: string[];
  supportsVoiceCommands?: boolean;
  /** Picture style for the client-side `generate_drawing` image prompt. */
  drawingStyle?: DrawingStyle;
};

export interface GameAssistantResponse {
  reply: string;
  commands: GameCommand[];
}

export interface ParentToGameEnvelopeBase {
  token: string;
}

export interface ParentInitMessage extends ParentToGameEnvelopeBase {
  type: "dodi:init";
  payload: {
    gameId: string;
    /** Present for goal-oriented games; absent for open play. */
    goal?: GameGoal;
    /** Present when resuming a snapshot — the game restores it before game:ready. */
    savedState?: GameSaveState;
  };
}

export interface ParentCommandMessage extends ParentToGameEnvelopeBase {
  type: "dodi:command";
  payload: {
    command: GameCommand;
  };
}

export interface ParentGetStateMessage extends ParentToGameEnvelopeBase {
  type: "dodi:get_state";
}

/** Host → game: request the full restorable serialization (snapshot save). */
export interface ParentGetSaveStateMessage extends ParentToGameEnvelopeBase {
  type: "dodi:get_save_state";
}

/** Host → game: the child has met the success goal — play the celebration UI. */
export interface ParentSuccessMessage extends ParentToGameEnvelopeBase {
  type: "dodi:success";
  payload: {
    summary?: string;
    metrics?: MetricsSummary;
  };
}

export type ParentToGameMessage =
  | ParentInitMessage
  | ParentCommandMessage
  | ParentGetStateMessage
  | ParentGetSaveStateMessage
  | ParentSuccessMessage;

export interface GameToParentEnvelopeBase {
  token: string;
}

export interface GameReadyMessage extends GameToParentEnvelopeBase {
  type: "game:ready";
  payload: {
    capabilities: string[];
    state?: GameStateSummary;
  };
}

export interface GameResultMessage extends GameToParentEnvelopeBase {
  type: "game:result";
  payload: {
    command: GameCommand;
    result: {
      ok: boolean;
      error?: string;
    };
    state?: GameStateSummary;
  };
}

export interface GameStateMessage extends GameToParentEnvelopeBase {
  type: "game:state";
  payload: GameStateSummary;
}

/** Game → host: the full restorable serialization, in reply to dodi:get_save_state. */
export interface GameSaveStateMessage extends GameToParentEnvelopeBase {
  type: "game:save_state";
  payload: {
    state: GameSaveState;
  };
}

/**
 * Game → host, immediate (non-debounced) progress update. Sent in addition to
 * game:state whenever progress or a tracked metric changes meaningfully, so the
 * host can evaluate success promptly.
 */
export interface GameProgressMessage extends GameToParentEnvelopeBase {
  type: "game:progress";
  payload: {
    progress: number;
    progressLabel?: string;
    metrics?: MetricsSummary;
  };
}

export interface GameEventMessage extends GameToParentEnvelopeBase {
  type: "game:event";
  payload: {
    event: string;
    message?: string;
    [key: string]: Json | undefined;
  };
}

export interface GameErrorMessage extends GameToParentEnvelopeBase {
  type: "game:error";
  payload: {
    error: string;
    command?: GameCommand;
    [key: string]: Json | GameCommand | undefined;
  };
}

export type GameToParentMessage =
  | GameReadyMessage
  | GameResultMessage
  | GameStateMessage
  | GameSaveStateMessage
  | GameProgressMessage
  | GameEventMessage
  | GameErrorMessage;

/**
 * Snapshot gallery blob: the lightweight, per-snapshot listing info decrypted
 * to render the collection without touching the heavy payload. Stored E2EE
 * (own: enc:v1: under the account VMK; received: SealedEnvelope to the kid's
 * friend KEM key).
 */
export interface SnapshotInfoV1 {
  v: 1;
  title: string;
  gameTitle: string;
  /** Downscaled thumbnail data URL, or null when the game has no visual surface. */
  thumbnail: string | null;
  createdAt: string;
}

/**
 * Snapshot payload blob: fully self-contained — carries the game code and
 * metadata alongside the save state so the snapshot outlives game edits and
 * deletion, and plays on a friend's device that never had the game.
 */
export interface SnapshotPayloadV1 {
  v: 1;
  title: string;
  createdAt: string;
  /** Soft reference to the source game (the sender's for shares); null once the game is gone. */
  gameId: string | null;
  gameTitle: string;
  gameDescription: string;
  gameMarkdown: string;
  codeBundle: string;
  capabilities: string[];
  drawingStyle: DrawingStyle;
  savedState: GameSaveState;
}

export type { DodiProgressState };
