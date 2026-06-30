/**
 * Agent task type definitions.
 *
 * Defines the request/response shapes for the coding agent API.
 */

import type { ProgressKind, SuccessCriteria } from "./success";

export type AgentTaskType = "generate_game" | "update_game" | "read_game_state";

// ---------------------------------------------------------------------------
// Request payloads
// ---------------------------------------------------------------------------

export interface GenerateGamePayload {
  prompt: string;
  title?: string;
  tags?: string[];
  /** Parent's plain-language learning goal (what the game should help with). */
  learningGoal?: string;
  /** Parent's plain-language success definition (how Dodi knows the child succeeded). */
  successDefinition?: string;
}

export interface UpdateGamePayload {
  instruction: string;
  existingCode: string;
  existingMarkdown?: string;
  title?: string;
  learningGoal?: string;
  successDefinition?: string;
}

export interface ReadGameStatePayload {
  gameState: Record<string, unknown>;
  question: string;
  gameMarkdown?: string;
  gameCodeBundle?: string;
  snapshot?: string;
}

export interface AgentTaskRequest {
  kidId: string;
  taskType: AgentTaskType;
  gameId?: string;
  childContext: {
    name: string;
    age?: number;
    language: string;
    /**
     * Scrubbing-free learning context (memory + parent notes) for the audience
     * kid(s), used to shape game design. Never echoed verbatim into game content.
     */
    learningContext?: string;
  };
  payload: GenerateGamePayload | UpdateGamePayload | ReadGameStatePayload;
}

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

export interface AgentCodeResult {
  taskType: "generate_game" | "update_game";
  title: string;
  description: string;
  tags: string[];
  codeBundle: string;
  markdown: string;
  metadata: Record<string, unknown>;
  learningGoal: string;
  successDefinition: string;
  successCriteria: SuccessCriteria;
  progressKind: ProgressKind;
  /** Short, friendly recap of what the agent built or changed (bullet lines). */
  changeSummary: string;
  validationPassed: boolean;
  iterationCount: number;
  /** Game ID after server-side persistence (create or update). */
  savedGameId?: string;
  /** Set when the game was generated but could not be saved (surfaced to the user). */
  saveError?: string;
}

export interface AgentAnalysisResult {
  taskType: "read_game_state";
  analysis: string;
}

export type AgentTaskResult = AgentCodeResult | AgentAnalysisResult;
