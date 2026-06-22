import type { Json } from "@/types/database";
import type {
  DodiProgressState,
  MetricsSummary,
  ProgressKind,
  SuccessCriteria,
} from "@/lib/games/success";

export type GameStateSummary = Record<string, Json | undefined>;

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
 * table. `family` = shared with the whole account; `profileIds` = specific kids.
 */
export interface GameSharingState {
  family: boolean;
  profileIds: string[];
}

export type GameMetadata = Record<string, Json | undefined> & {
  version?: string;
  category?: string;
  capabilities?: string[];
  supportsVoiceCommands?: boolean;
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
  | GameProgressMessage
  | GameEventMessage
  | GameErrorMessage;

export type { DodiProgressState };
