import type { Json } from "@/types/database";

export type GameStateSummary = Record<string, Json | undefined>;

export interface GameCommand {
  type: string;
  payload?: Record<string, Json | undefined>;
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

export type ParentToGameMessage =
  | ParentInitMessage
  | ParentCommandMessage
  | ParentGetStateMessage;

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
  | GameEventMessage
  | GameErrorMessage;
